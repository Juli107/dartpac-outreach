import { db } from "./db";
import type { RadarData } from "./radar/store";

/**
 * Dueño de cada contacto, para que dos vendedores no le escriban a la misma empresa: el vendedor que figura como
 * dueño (Contact.ownerId), el remitente de una secuencia en la que ya está activo o, si salió del Radar, el vendedor
 * asignado a la empresa o el último que le escribió.
 */
export const nom1 = (n: string | null | undefined) =>
  String(n ?? "").trim().split(/\s+/)[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type SenderMin = { id: string; name: string };

/** El remitente que corresponde a un nombre del Radar («Luis», «Luis Mendieta»…), comparando el primer nombre. */
export function senderPorNombre(nombre: string, senders: SenderMin[]): SenderMin | null {
  const n = nom1(nombre);
  return (n && senders.find((x) => nom1(x.name) === n)) || null;
}

/** Los contactos libres de esta lista pasan a ser de este vendedor (los que ya tienen dueño no cambian). */
export async function tomarClientes(ids: string[], senderId: string | null | undefined, seccion?: string | null) {
  if (!senderId || !ids.length) return 0;
  const r = await db.contact.updateMany({ where: { id: { in: ids }, ownerId: null }, data: { ownerId: senderId, ownerAt: new Date(), ...(seccion ? { seccion } : {}) } });
  return r.count;
}

/**
 * Completa el dueño de los contactos que todavía no tienen: el remitente de la secuencia donde están o, si salieron
 * del Radar, el vendedor asignado o el último que les escribió. Se corre al abrir Contactos y Equipo (de a tandas).
 */
export async function asignarDuenosPendientes(max = 2000) {
  try {
    const conSecuencia = await db.contact.findMany({
      where: { ownerId: null, enrollments: { some: { sequence: { senderId: { not: null } } } } },
      select: { id: true, enrollments: { where: { sequence: { senderId: { not: null } } }, orderBy: { createdAt: "asc" }, take: 1, select: { sequence: { select: { senderId: true } } } } },
      take: max,
    });
    const porSender = new Map<string, string[]>();
    for (const c of conSecuencia) {
      const sid = c.enrollments[0]?.sequence.senderId;
      if (sid) porSender.set(sid, [...(porSender.get(sid) ?? []), c.id]);
    }
    for (const [sid, ids] of porSender) await tomarClientes(ids, sid);

    // del Radar, solo las empresas que tienen vendedor asignado o a las que alguien ya les escribió
    const delRadar = await db.$queryRaw<{ id: string; data: RadarData }[]>`
      SELECT c.id, jsonb_build_object('asignado', r.data->'asignado', 'asignadoId', r.data->'asignadoId', 'historial', r.data->'historial') AS data
      FROM "Contact" c JOIN "RadarDoc" r ON r.col = 'prospectos' AND r.id = c."radarId" AND r.deleted = false
      WHERE c."ownerId" IS NULL
        AND (coalesce(r.data->>'asignado', '') <> '' OR coalesce(r.data->>'asignadoId', '') <> ''
          OR jsonb_path_exists(r.data, '$.historial[*] ? (@.tipo == "envio" || @.tipo == "mail" || @.tipo == "contacto")'))
      LIMIT ${max}`;
    if (!delRadar.length) return;
    const senders = await db.sender.findMany({ select: { id: true, name: true } });
    const radarSender = new Map<string, string[]>();
    for (const { id, data: p } of delRadar) {
      const sid = (typeof p.asignadoId === "string" && senders.some((x) => x.id === p.asignadoId) ? p.asignadoId : null) ?? senderPorNombre(duenoRadar(p), senders)?.id;
      if (sid) radarSender.set(sid, [...(radarSender.get(sid) ?? []), id]);
    }
    for (const [sid, ids] of radarSender) await tomarClientes(ids, sid);
  } catch (e) {
    console.error("asignarDuenosPendientes", e);
  }
}

/** Quién trabaja la empresa según el Radar: el asignado o el último que le mandó un mail o un WhatsApp. */
export function duenoRadar(p: RadarData): string {
  const asignado = typeof p.asignado === "string" ? p.asignado.trim() : "";
  if (asignado) return asignado;
  const h = Array.isArray(p.historial) ? (p.historial as RadarData[]) : [];
  const ultimo = h.filter((x) => ["envio", "mail", "contacto"].includes(String(x.tipo)) && x.por && x.por !== "Outreach" && x.por !== "Automática").pop();
  return ultimo ? String(ultimo.por) : "";
}

/**
 * De estos contactos, los que ya trabaja otro vendedor que no es el remitente de esta secuencia, con su nombre.
 * Si la secuencia todavía no tiene remitente, cuenta como de otro cualquier dueño que ya tengan.
 */
export async function deOtroVendedor(sequenceId: string, contactIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!contactIds.length) return out;
  const seq = await db.sequence.findUnique({ where: { id: sequenceId }, select: { senderId: true, sender: { select: { name: true } } } });
  const yo = nom1(seq?.sender?.name);
  const contactos = await db.contact.findMany({
    where: { id: { in: contactIds } },
    select: {
      id: true,
      radarId: true,
      ownerId: true,
      owner: { select: { name: true } },
      enrollments: {
        where: { status: { in: ["ACTIVE", "PAUSED"] }, sequenceId: { not: sequenceId }, sequence: { senderId: { not: null } } },
        select: { sequence: { select: { senderId: true, sender: { select: { name: true } } } } },
      },
    },
  });
  const radarIds = contactos.map((c) => c.radarId).filter((x): x is string => !!x);
  const docs = radarIds.length ? await db.radarDoc.findMany({ where: { col: "prospectos", id: { in: radarIds }, deleted: false }, select: { id: true, data: true } }) : [];
  const porRadar = new Map(docs.map((d) => [d.id, duenoRadar(d.data as RadarData)]));
  for (const c of contactos) {
    // el dueño anotado manda: si es otro vendedor, no se suma; si es el de esta secuencia, listo
    if (c.ownerId && c.owner) {
      if (c.ownerId !== seq?.senderId) out.set(c.id, c.owner.name);
      continue;
    }
    const otra = c.enrollments.find((e) => e.sequence.senderId !== seq?.senderId);
    if (otra?.sequence.sender) {
      out.set(c.id, otra.sequence.sender.name);
      continue;
    }
    const d = c.radarId ? porRadar.get(c.radarId) : "";
    if (d && nom1(d) !== yo) out.set(c.id, d);
  }
  return out;
}
