import { NextResponse, after } from "next/server";
import { z } from "zod";
import { espejarProspectos } from "@/lib/radar/espejo";
import { borraCampos, deleteDoc, deleteDocs, NotFound, setDoc, setDocs, updateDoc, updateDocs, validPath, VersionConflict, type RadarData } from "@/lib/radar/store";
import { db } from "@/lib/db";
import { usuarioActual, type Usuario } from "@/lib/usuario";
import { registrar } from "@/lib/actividad";
import { duenoRadar, nom1 } from "@/lib/dueno";
import { provNom, rubNom } from "@/lib/radar/geo";

export const dynamic = "force-dynamic";
// completar muchas empresas de una base son cambios uno por uno: con 100 por pedido alcanza y sobra
export const maxDuration = 60;

const Op = z.object({
  op: z.enum(["set", "update", "delete"]),
  c: z.string(),
  id: z.string(),
  d: z.record(z.unknown()).optional(),
  v: z.number().int().positive().optional(),
});
// hasta 500 por pedido: importar una base manda las altas de a 500 (entran en una sola consulta)
const Body = z.union([Op, z.object({ ops: z.array(Op).min(1).max(500) })]);

type OpT = z.infer<typeof Op>;
const CONTACTO = ["envio", "mail", "contacto", "etapa"];
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Entradas nuevas del historial (de los últimos minutos) que son un mensaje o un cambio de etapa hecho por una persona. */
function contactosNuevos(o: OpT): RadarData[] {
  const h = o.c === "prospectos" && o.op !== "delete" && Array.isArray(o.d?.historial) ? (o.d!.historial as RadarData[]) : [];
  const desde = Date.now() - 5 * 60_000;
  return h.filter((x) => x && CONTACTO.includes(String(x.tipo)) && Number(x.t) > desde && !["Outreach", "Automática", "Claude"].includes(String(x.por ?? "")));
}

/**
 * Un vendedor no le puede escribir a un cliente de otro: si el cliente ya tiene dueño (el que lo buscó, lo cargó o le
 * escribió primero) y no es él, se frena. El administrador puede igual.
 */
async function clienteDeOtro(u: Usuario, ops: OpT[]): Promise<string | null> {
  if (u.admin || !u.senderId) return null;
  const mio = (h: RadarData) => nom1(String(h.por ?? "")) === nom1(u.name);
  const ids = ops.filter((o) => contactosNuevos(o).some(mio)).map((o) => o.id);
  if (!ids.length) return null;
  const [contactos, docs] = await Promise.all([
    db.contact.findMany({ where: { radarId: { in: ids }, ownerId: { not: null } }, select: { ownerId: true, owner: { select: { name: true } }, company: true } }),
    db.radarDoc.findMany({ where: { col: "prospectos", id: { in: ids }, deleted: false }, select: { data: true } }),
  ]);
  const c = contactos.find((x) => x.ownerId !== u.senderId);
  if (c?.owner) return `${c.company ?? "Ese cliente"} ya lo contactó ${c.owner.name}. No le podés escribir: es cliente de ${c.owner.name.split(/\s+/)[0]}.`;
  if (contactos.length) return null;
  for (const d of docs) {
    const p = d.data as RadarData;
    const dueno = duenoRadar(p);
    if (dueno && nom1(dueno) !== nom1(u.name)) return `${txt(p.nombre) || "Ese cliente"} ya lo contactó ${dueno}. No le podés escribir: es cliente de ${dueno.split(/\s+/)[0]}.`;
  }
  return null;
}

/** Anota en la actividad del usuario las búsquedas que lanza y los mensajes que manda desde el Radar. */
async function anotar(u: Usuario, ops: OpT[]) {
  for (const o of ops) {
    if (o.c === "busquedas" && o.op === "set" && o.d && Number(o.d.parte ?? 1) === 1 && o.d.estado === "pendiente") {
      const zona = txt((o.d.zona as RadarData | undefined)?.nombre) || provNom(txt(o.d.provincia));
      const rubros = (Array.isArray(o.d.rubros) ? (o.d.rubros as string[]) : []).map(rubNom).join(", ");
      const red = txt(o.d.red);
      await registrar(quienDe(u, o.d), "busqueda", `Buscó clientes en ${zona}${red ? ` (${red})` : ""}${rubros ? ` · ${rubros}` : ""}`, { ref: `busqueda:${txt(o.d.grupo) || o.id}` });
    }
    for (const h of contactosNuevos(o)) {
      const doc = await db.radarDoc.findUnique({ where: { col_id: { col: "prospectos", id: o.id } }, select: { data: true } });
      const nombre = txt((doc?.data as RadarData | undefined)?.nombre) || "una empresa";
      const contacto = await db.contact.findFirst({ where: { radarId: o.id }, select: { id: true } });
      await registrar(quienDe(u, h), "mensaje", `${nombre}: ${txt(h.texto) || String(h.tipo)}`, { contactId: contacto?.id, ref: `radar:${o.id}:${h.t}` });
    }
  }
}

/** Quién lo hizo: el usuario que entró con Google o, con la contraseña común, el nombre elegido en el Radar. */
function quienDe(u: Usuario, d: RadarData) {
  if (u.senderId) return u;
  const por = txt(d.por);
  return { name: por || u.name, senderId: null };
}

/** Escrituras del Radar: set (reemplaza), update (mezcla campos) y delete. Acepta una o varias. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  const ops = "ops" in parsed.data ? parsed.data.ops : [parsed.data];
  const u = await usuarioActual();
  // las búsquedas quedan a nombre de quien entró (lo que encuentren va a su sección)
  if (u.senderId) for (const o of ops) if (o.c === "busquedas" && o.op === "set" && o.d) Object.assign(o.d, { por: u.name.split(/\s+/)[0], porId: u.senderId });
  const bloqueo = await clienteDeOtro(u, ops);
  if (bloqueo) {
    await registrar(u, "bloqueo", bloqueo);
    return NextResponse.json({ error: "de_otro", detail: bloqueo }, { status: 409 });
  }
  after(() => anotar(u, ops));
  // lo que se carga o se cambia en el Radar queda también en Contactos (después de responder)
  const aContactos = ops.filter((o) => o.c === "prospectos" && o.op !== "delete").map((o) => o.id);
  if (aContactos.length) after(() => espejarProspectos(aContactos));
  const out: { id: string; v?: number }[] = [];
  for (const o of ops) if (!validPath(o.c, o.id)) return NextResponse.json({ error: "invalid_argument", detail: `${o.c}/${o.id}` }, { status: 400 });
  // En bloque, del mismo tipo y la misma colección (importar una base, eliminar o cambiar las marcadas):
  // una consulta para todas en vez de una por documento. Los ajustes (config) y los cambios con versión van uno por uno.
  const c0 = ops[0].c, mismo = (op: string) => ops.length > 1 && c0 !== "config" && ops.every((o) => o.op === op && o.c === c0);
  if (mismo("set")) {
    const vs = await setDocs(c0, ops.map((o) => ({ id: o.id, data: o.d ?? {} })));
    return NextResponse.json({ ok: true, docs: ops.map((o, i) => ({ id: o.id, v: vs[i] })), now: Date.now() });
  }
  if (mismo("delete")) {
    await deleteDocs(c0, ops.map((o) => o.id));
    return NextResponse.json({ ok: true, docs: ops.map((o) => ({ id: o.id })), now: Date.now() });
  }
  if (mismo("update") && ops.every((o) => o.v == null && !borraCampos(o.d ?? {}))) {
    const vs = await updateDocs(c0, ops.map((o) => ({ id: o.id, data: o.d ?? {} })));
    return NextResponse.json({ ok: true, docs: ops.map((o, i) => ({ id: o.id, v: vs[i] })), now: Date.now() });
  }
  for (const o of ops) {
    if (!validPath(o.c, o.id)) return NextResponse.json({ error: "invalid_argument", detail: `${o.c}/${o.id}` }, { status: 400 });
    try {
      if (o.op === "delete") {
        await deleteDoc(o.c, o.id);
        out.push({ id: o.id });
      } else if (o.op === "set") {
        out.push({ id: o.id, v: await setDoc(o.c, o.id, o.d ?? {}) });
      } else {
        // Los ajustes del Radar (config/empresa…) se crean con el primer cambio: la base importada no los trae.
        const v = await updateDoc(o.c, o.id, o.d ?? {}, { ifVersion: o.v, create: o.c === "config" });
        out.push({ id: o.id, v: v ?? undefined });
      }
    } catch (e) {
      if (e instanceof NotFound) return NextResponse.json({ error: "not_found", detail: `${o.c}/${o.id}` }, { status: 404 });
      if (e instanceof VersionConflict) return NextResponse.json({ error: "conflict", detail: e.message }, { status: 409 });
      throw e;
    }
  }
  return NextResponse.json({ ok: true, docs: out, now: Date.now() });
}
