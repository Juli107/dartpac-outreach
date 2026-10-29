import { db } from "./db";
import { sePuedeEnviar } from "./verifier";
import { contactWaCelular } from "./whatsapp";
import { registrar } from "./actividad";
import { todayStart } from "./quota";
import { NO_CONTACTAR } from "./radar/espejo";
import { updateDocs } from "./radar/store";
import { primerNombre } from "./usuario";

/**
 * Reparto diario: cada día hábil desde las 8 de la mañana (hora de Buenos Aires), cada remitente que participa recibe
 * sus contactos nuevos al azar (100 por defecto) y entran a sus dos secuencias: la de mails (los que tienen email
 * válido) y la de WhatsApp (los que tienen celular o WhatsApp cargado; a un fijo no). Cada contacto queda como cliente de ese remitente.
 *
 * Quién entra al reparto:
 * - los libres (sin vendedor) o del propio remitente que nunca estuvieron en una secuencia;
 * - los que ya recibieron una secuencia solo los toma OTRO remitente, una semana después de que terminó, y nunca si
 *   respondieron, pidieron la baja o rebotaron.
 * Nunca enciende secuencias ni envía nada: los envíos salen cuando el administrador enciende cada secuencia.
 */

export const REPARTO = { contactos: 100, mails: 100, whatsapp: 40 };
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
const RONDA = 20;
const ZONA = () => process.env.SEND_TIMEZONE ?? "America/Argentina/Buenos_Aires";

/** Fecha (AAAA-MM-DD), hora y día de la semana (0 = domingo) en Buenos Aires. */
export function ahoraAR(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONA(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), dia: dias.indexOf(p.weekday) };
}

/** ¿Ya es la hora del reparto de hoy? Días hábiles, desde las 8. */
export const esHoraReparto = (now = new Date()) => {
  const a = ahoraAR(now);
  return a.dia >= 1 && a.dia <= 5 && a.hora >= 8;
};

type SenderMin = { id: string; name: string; seqMailId: string | null; seqWaId: string | null };

const MAILS = (yo: string) => [
  {
    delayDays: 0,
    subject: "{{mi_empresa}} · {{empresa}}",
    body: `{{saludo}}, equipo de {{empresa|su empresa}}:

Mi nombre es {{vendedor}} y les escribo de {{mi_empresa}}. Proveemos film stretch, bolsas y descartables a comercios y empresas, con entregas en todo el país.

¿Me podrían indicar quién se encarga de las compras? Con gusto le paso el catálogo y la lista de precios.

Saludos,
${yo}`,
  },
  {
    delayDays: 3,
    subject: "",
    body: `{{saludo}}:

Les escribo de nuevo por si el correo anterior se perdió. ¿Les sirve que les pase el catálogo de {{mi_empresa}}?

Saludos,
${yo}`,
  },
  {
    delayDays: 7,
    subject: "",
    body: `{{saludo}}:

Último mensaje para no molestar: si en algún momento necesitan film stretch, bolsas o descartables, respondan este correo y les paso precios en el día.

Saludos,
${yo}`,
  },
];

const WHATSAPPS = [
  { delayDays: 0, body: "{{saludo}}, ¿cómo están? Soy {{vendedor}} de {{mi_empresa}}. Trabajamos film stretch, bolsas y descartables para comercios como {{empresa|el suyo}}. ¿Me pasan el contacto de quien se encarga de las compras?" },
  { delayDays: 4, body: "{{saludo}}, les escribo de nuevo de {{mi_empresa}}. ¿Les paso el catálogo y la lista de precios?" },
];

/** Crea (apagadas) las dos secuencias del remitente si todavía no las tiene. Devuelve sus ids. */
export async function asegurarSecuencias(senderId: string) {
  const s = await db.sender.findUniqueOrThrow({ where: { id: senderId } });
  const existe = async (id: string | null) => (id ? !!(await db.sequence.findUnique({ where: { id }, select: { id: true } })) : false);
  let { seqMailId, seqWaId } = s;
  const nombre = primerNombre(s.name) || s.name;
  if (!(await existe(seqMailId))) {
    const seq = await db.sequence.create({
      data: {
        name: `Reparto · Mails · ${nombre}`,
        senderId,
        status: "PAUSED",
        sendingOn: false,
        dailyLimit: Math.max(s.dailyLimit, REPARTO.mails),
        steps: { create: MAILS(nombre).map((m, i) => ({ order: i + 1, type: "EMAIL" as const, delayDays: m.delayDays, subject: m.subject, body: m.body, sameThread: i > 0 })) },
      },
    });
    seqMailId = seq.id;
  }
  if (!(await existe(seqWaId))) {
    const seq = await db.sequence.create({
      data: {
        name: `Reparto · WhatsApp · ${nombre}`,
        senderId,
        status: "PAUSED",
        sendingOn: false,
        dailyLimit: REPARTO.whatsapp,
        steps: { create: WHATSAPPS.map((w, i) => ({ order: i + 1, type: "WHATSAPP" as const, delayDays: w.delayDays, subject: `WhatsApp a {{empresa}}`, body: w.body })) },
      },
    });
    seqWaId = seq.id;
  }
  if (seqMailId !== s.seqMailId || seqWaId !== s.seqWaId) await db.sender.update({ where: { id: senderId }, data: { seqMailId, seqWaId } });
  return { seqMailId: seqMailId!, seqWaId: seqWaId! };
}

/** Contactos que ya recibió hoy cada remitente por el reparto (entradas a sus dos secuencias). */
export async function cargadosHoy(senders: SenderMin[], now = new Date()) {
  const desde = todayStart(now);
  const out = new Map<string, number>();
  for (const s of senders) {
    const ids = [s.seqMailId, s.seqWaId].filter((x): x is string => !!x);
    if (!ids.length) {
      out.set(s.id, 0);
      continue;
    }
    const r = await db.enrollment.findMany({ where: { sequenceId: { in: ids }, createdAt: { gte: desde } }, select: { contactId: true }, distinct: ["contactId"] });
    out.set(s.id, r.length);
  }
  return out;
}

/** Contactos que podría recibir este remitente, al azar (primero los suyos que nunca recibieron nada). */
async function candidatos(senderId: string, n: number, tomados: string[], now: Date) {
  if (n <= 0) return [];
  const limite = new Date(now.getTime() - SEMANA_MS);
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Contact" c
    WHERE c.unsubscribed = false AND c.bounced = false
      AND NOT (${NO_CONTACTAR} = ANY(coalesce(c.tags, ARRAY[]::text[])))
      AND NOT (c.id = ANY(${tomados}::text[]))
      AND (
        (c.email IS NOT NULL AND coalesce(c."emailStatus", '') NOT IN ('invalido', 'corregible'))
        OR coalesce(c.whatsapp, '') <> '' OR coalesce(c.phone, '') <> ''
      )
      AND (
        (
          NOT EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."contactId" = c.id)
          AND (c."ownerId" IS NULL OR c."ownerId" = ${senderId})
        )
        OR (
          EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."contactId" = c.id)
          AND NOT EXISTS (
            SELECT 1 FROM "Enrollment" e WHERE e."contactId" = c.id
              AND (e.status <> 'FINISHED' OR coalesce(e."finishedAt", e."createdAt") > ${limite})
          )
          AND NOT EXISTS (SELECT 1 FROM "Reply" r WHERE r."contactId" = c.id)
          AND NOT EXISTS (
            SELECT 1 FROM "Enrollment" e JOIN "Sequence" s ON s.id = e."sequenceId"
            WHERE e."contactId" = c.id AND s."senderId" = ${senderId}
          )
          AND (c."ownerId" IS NULL OR c."ownerId" <> ${senderId})
        )
      )
    ORDER BY (c."ownerId" IS NOT DISTINCT FROM ${senderId}) DESC, random()
    LIMIT ${n}`;
  return rows.map((r) => r.id);
}

/** Cuántos contactos hay hoy disponibles para repartir (aproximado: libres o que ya cumplieron la semana). */
export async function disponibles(now = new Date()) {
  const limite = new Date(now.getTime() - SEMANA_MS);
  const r = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "Contact" c
    WHERE c.unsubscribed = false AND c.bounced = false AND NOT (${NO_CONTACTAR} = ANY(coalesce(c.tags, ARRAY[]::text[])))
      AND ((c.email IS NOT NULL AND coalesce(c."emailStatus", '') NOT IN ('invalido', 'corregible')) OR coalesce(c.whatsapp, '') <> '' OR coalesce(c.phone, '') <> '')
      AND (
        (NOT EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."contactId" = c.id) AND c."ownerId" IS NULL)
        OR (
          EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."contactId" = c.id)
          AND NOT EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."contactId" = c.id AND (e.status <> 'FINISHED' OR coalesce(e."finishedAt", e."createdAt") > ${limite}))
          AND NOT EXISTS (SELECT 1 FROM "Reply" r WHERE r."contactId" = c.id)
        )
      )`;
  return Number(r[0]?.n ?? 0);
}

/** Suma los contactos a las secuencias del remitente y lo deja como su dueño. Devuelve cuántos entraron a cada una. */
async function cargar(s: SenderMin & { seqMailId: string; seqWaId: string }, ids: string[]) {
  if (!ids.length) return { mails: 0, wa: 0 };
  const contactos = await db.contact.findMany({ where: { id: { in: ids } } });
  const porMail = contactos.filter((c) => sePuedeEnviar(c)).map((c) => c.id);
  const porWa = contactos.filter((c) => !!contactWaCelular(c)).map((c) => c.id);
  const [m, w] = await db.$transaction([
    db.enrollment.createMany({ data: porMail.map((contactId) => ({ sequenceId: s.seqMailId, contactId })), skipDuplicates: true }),
    db.enrollment.createMany({ data: porWa.map((contactId) => ({ sequenceId: s.seqWaId, contactId })), skipDuplicates: true }),
    db.contact.updateMany({ where: { id: { in: ids } }, data: { ownerId: s.id, ownerAt: new Date() } }),
    db.contact.updateMany({ where: { id: { in: ids }, OR: [{ seccion: null }, { ownerId: { not: s.id } }] }, data: { seccion: `Reparto – ${s.name}` } }),
  ]);
  // el Radar también sabe de quién es cada empresa (así nadie más le escribe desde ahí)
  const radar = contactos.filter((c) => c.radarId).map((c) => ({ id: c.radarId!, data: { asignado: primerNombre(s.name), asignadoId: s.id } }));
  for (let i = 0; i < radar.length; i += 200) await updateDocs("prospectos", radar.slice(i, i + 200)).catch(() => undefined);
  return { mails: m.count, wa: w.count };
}

/**
 * Reparte los contactos del día. Por rondas de a 20 y en orden al azar, para que todos los remitentes reciban
 * contactos parecidos. Nunca pasa del cupo diario de cada uno, aunque se llame más de una vez el mismo día.
 */
export async function repartir(now = new Date(), por: { name: string; senderId: string | null } | null = null) {
  const senders = await db.sender.findMany({ where: { repartoOn: true }, orderBy: { name: "asc" } });
  if (!senders.length) return { remitentes: 0, cargados: 0, detalle: [] as { nombre: string; contactos: number; mails: number; wa: number }[] };
  const listos: (SenderMin & { seqMailId: string; seqWaId: string; falta: number; repartoDia: number })[] = [];
  for (const s of senders) listos.push({ ...s, ...(await asegurarSecuencias(s.id)), falta: 0, repartoDia: s.repartoDia });
  const hoy = await cargadosHoy(listos, now);
  for (const s of listos) s.falta = Math.max(0, s.repartoDia - (hoy.get(s.id) ?? 0));

  const tomados: string[] = [];
  const res = new Map(listos.map((s) => [s.id, { nombre: s.name, contactos: 0, mails: 0, wa: 0 }]));
  for (let vuelta = 0; vuelta < 50 && listos.some((s) => s.falta > 0); vuelta++) {
    let alguno = false;
    for (const s of [...listos].sort(() => Math.random() - 0.5)) {
      if (s.falta <= 0) continue;
      const ids = await candidatos(s.id, Math.min(RONDA, s.falta), tomados, now);
      if (!ids.length) {
        s.falta = 0;
        continue;
      }
      alguno = true;
      tomados.push(...ids);
      const r = await cargar(s, ids);
      const x = res.get(s.id)!;
      x.contactos += ids.length;
      x.mails += r.mails;
      x.wa += r.wa;
      s.falta -= ids.length;
    }
    if (!alguno) break;
  }
  const detalle = [...res.values()];
  for (const s of listos) {
    const x = res.get(s.id)!;
    if (x.contactos)
      await registrar(por ?? { name: "Reparto diario", senderId: null }, "reparto", `${primerNombre(s.name)} recibió ${x.contactos} contactos: ${x.mails} a su secuencia de mails y ${x.wa} a la de WhatsApp.`);
  }
  return { remitentes: listos.length, cargados: tomados.length, detalle };
}

/** Lo llama el programador en cada pasada: reparte una sola vez por día hábil, desde las 8, si está encendido. */
export async function repartoSiHaceFalta(now = new Date()) {
  if (!esHoraReparto(now)) return null;
  const { fecha } = ahoraAR(now);
  // marca el día antes de repartir: si dos pasadas llegan juntas, solo una reparte
  const r = await db.setting.updateMany({ where: { id: "app", repartoOn: true, repartoUltimo: { not: fecha } }, data: { repartoUltimo: fecha } });
  if (!r.count) return null;
  return repartir(now);
}
