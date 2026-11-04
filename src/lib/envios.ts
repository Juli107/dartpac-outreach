import { db } from "./db";
import { canalDe, type Canal } from "./actividad";
import { primerNombre } from "./usuario";
import { sincronizarEtapas } from "./etapas";

export const CANALES: { key: Canal; label: string; uno: string; ic: string; tone: "ok" | "info" | "warn" }[] = [
  { key: "mail", label: "Mails", uno: "Mail", ic: "✉️", tone: "info" },
  { key: "whatsapp", label: "WhatsApp", uno: "WhatsApp", ic: "💬", tone: "ok" },
  { key: "llamada", label: "Llamadas", uno: "Llamada", ic: "📞", tone: "warn" },
];

export type Envio = { id: string; at: Date; quien: string; senderId: string | null; tipo: string; texto: string; canal: string | null; contactId: string | null; c: Canal; dueno: string };
export type FilaEnvios = { id: string; name: string; mail: number; whatsapp: number; llamada: number; personas: Set<string> };

/**
 * Todos los mails, WhatsApp y llamadas desde una fecha, cada uno con su dueño: el remitente con el que entró o, con la
 * contraseña común, el que eligió en el Radar (por el nombre).
 */
export async function enviosDesde(desde: Date | null, senders: { id: string; name: string }[], max = 20000): Promise<Envio[]> {
  await sincronizarEtapas(); // trae del Radar las marcas «No tiene WhatsApp»
  const filas = await db.actividad.findMany({
    where: {
      ...(desde ? { at: { gte: desde } } : {}),
      OR: [{ canal: { not: null } }, { canal: null, tipo: { in: ["mail", "whatsapp", "mensaje"] } }],
    },
    orderBy: { at: "desc" },
    take: max,
    select: { id: true, at: true, quien: true, senderId: true, tipo: true, texto: true, canal: true, contactId: true },
  });
  const porNombre = new Map(senders.map((s) => [primerNombre(s.name).toLowerCase(), s.id]));
  const duenoDe = (a: { senderId: string | null; quien: string }) => a.senderId ?? porNombre.get(primerNombre(a.quien).toLowerCase()) ?? `n:${a.quien}`;
  const todos = filas.map((a) => ({ ...a, c: canalDe(a), dueno: duenoDe(a) })).filter((a): a is Envio => !!a.c);
  // un WhatsApp a alguien que no tiene WhatsApp no llegó: no cuenta como enviado
  const ids = [...new Set(todos.filter((a) => a.c === "whatsapp" && a.contactId).map((a) => a.contactId!))];
  const sinWa = new Set(ids.length ? (await db.contact.findMany({ where: { id: { in: ids }, waMarca: "no" }, select: { id: true } })).map((c) => c.id) : []);
  return sinWa.size ? todos.filter((a) => !(a.c === "whatsapp" && a.contactId && sinWa.has(a.contactId))) : todos;
}

/** Cuántos de cada canal y a cuántas empresas distintas, por persona (las de `senders` aparecen aunque estén en cero). */
export function contarPorPersona(envios: Envio[], senders: { id: string; name: string }[]): FilaEnvios[] {
  const tabla = new Map<string, FilaEnvios>();
  for (const s of senders) tabla.set(s.id, { id: s.id, name: s.name, mail: 0, whatsapp: 0, llamada: 0, personas: new Set() });
  for (const a of envios) {
    let f = tabla.get(a.dueno);
    if (!f) tabla.set(a.dueno, (f = { id: a.dueno, name: a.quien || "Sin nombre", mail: 0, whatsapp: 0, llamada: 0, personas: new Set() }));
    f[a.c]++;
    f.personas.add(a.contactId ?? a.texto.split(":")[0]);
  }
  return [...tabla.values()].sort((a, b) => b.mail + b.whatsapp + b.llamada - (a.mail + a.whatsapp + a.llamada));
}
