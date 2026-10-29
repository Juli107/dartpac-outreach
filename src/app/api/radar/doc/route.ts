import { NextResponse, after } from "next/server";
import { z } from "zod";
import { espejarProspectos } from "@/lib/radar/espejo";
import { borraCampos, deleteDoc, deleteDocs, NotFound, setDoc, setDocs, updateDoc, updateDocs, validPath, VersionConflict } from "@/lib/radar/store";

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

/** Escrituras del Radar: set (reemplaza), update (mezcla campos) y delete. Acepta una o varias. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  const ops = "ops" in parsed.data ? parsed.data.ops : [parsed.data];
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
