import { db } from "./db";
import type { RadarData } from "./radar/store";

/**
 * Dueño de cada contacto, para que dos vendedores no le escriban a la misma empresa: el remitente de una secuencia
 * en la que ya está activo o, si salió del Radar, el vendedor asignado a la empresa o el último que le escribió.
 */
const nom1 = (n: string | null | undefined) =>
  String(n ?? "").trim().split(/\s+/)[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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
