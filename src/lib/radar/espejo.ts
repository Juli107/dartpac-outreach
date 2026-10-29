import { Prisma } from "@prisma/client";
import { db } from "../db";
import { datosContacto } from "./outreach";
import { rubNom } from "./geo";
import type { RadarData } from "./store";

/**
 * Todo lo que entra al Radar (búsquedas de Claude, importaciones, altas a mano) queda también en Contactos, para
 * distribuirlo desde ahí en las secuencias. El contacto se une a su empresa por `radarId`: si ya existía (mismo
 * email), se vincula; si cambian los datos en el Radar, se completa lo que le faltaba sin pisar lo que se editó en
 * Contactos. Borrar una empresa del Radar no borra su contacto.
 */
export const NO_CONTACTAR = "no contactar";
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const esMail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const emailDe = (p: RadarData) => {
  const e = s(p.email).toLowerCase();
  return esMail(e) ? e : null;
};
const bloqueada = (p: RadarData) => !!p.noContactar || p.etapa === "descartado";
const etiquetas = (p: RadarData) => [...new Set(["radar", rubNom(String(p.rubro ?? "otro")).toLowerCase(), ...(bloqueada(p) ? [NO_CONTACTAR] : [])])];

type Fila = { id: string; data: RadarData };

async function espejar(filas: Fila[]) {
  if (!filas.length) return 0;
  const ids = filas.map((f) => f.id);
  const vinculados = await db.contact.findMany({ where: { radarId: { in: ids } } });
  const porRadar = new Map(vinculados.map((c) => [c.radarId!, c]));
  const emails = [...new Set(filas.map((f) => emailDe(f.data)).filter((e): e is string => !!e))];
  const porEmail = new Map(
    (emails.length ? await db.contact.findMany({ where: { email: { in: emails } } }) : []).map((c) => [c.email!, c]),
  );

  const nuevos: Prisma.ContactCreateManyInput[] = [];
  const usados = new Set<string>();
  let n = 0;
  for (const { id, data: p } of filas) {
    const base = datosContacto(id, p);
    const email = emailDe(p);
    const c = porRadar.get(id) ?? (email && !porEmail.get(email)?.radarId ? porEmail.get(email) : undefined);
    if (c) {
      // completa lo que falta y mantiene la marca de «no contactar» igual que en el Radar
      const libre = email && !c.email && !porEmail.has(email) && !usados.has(email);
      if (libre) usados.add(email);
      const tags = [...new Set([...c.tags.filter((t) => t !== NO_CONTACTAR), "radar", ...(bloqueada(p) ? [NO_CONTACTAR] : [])])];
      const data: Prisma.ContactUpdateInput = {
        ...(c.radarId ? {} : { radarId: id }),
        ...(libre ? { email } : {}),
        ...(c.company ? {} : { company: base.company }),
        ...(c.phone ? {} : { phone: base.phone }),
        ...(c.whatsapp ? {} : { whatsapp: base.whatsapp }),
        ...(c.city ? {} : { city: base.city }),
        ...(c.province ? {} : { province: base.province }),
        ...(c.website ? {} : { website: base.website }),
        ...(tags.join("|") !== c.tags.join("|") ? { tags } : {}),
      };
      const cambia = Object.entries(data).some(([k, v]) => v != null && (c as Record<string, unknown>)[k] !== v);
      if (cambia) {
        await db.contact.update({ where: { id: c.id }, data });
        n++;
      }
      continue;
    }
    // dos empresas con el mismo email: la segunda entra sin email (con su teléfono)
    const libre = email && !porEmail.has(email) && !usados.has(email) ? email : null;
    if (libre) usados.add(libre);
    nuevos.push({ ...base, email: libre, tags: etiquetas(p) });
  }
  if (nuevos.length) n += (await db.contact.createMany({ data: nuevos, skipDuplicates: true })).count;
  return n;
}

/** Copia a Contactos las empresas del Radar indicadas (después de guardarlas). Nunca falla. */
export async function espejarProspectos(ids: string[]) {
  try {
    const unicos = [...new Set(ids)].filter(Boolean);
    for (let i = 0; i < unicos.length; i += 500) {
      const rows = await db.radarDoc.findMany({ where: { col: "prospectos", id: { in: unicos.slice(i, i + 500) }, deleted: false }, select: { id: true, data: true } });
      await espejar(rows.map((r) => ({ id: r.id, data: r.data as RadarData })));
    }
  } catch (e) {
    console.error("espejarProspectos", e);
  }
}

/** Empresas del Radar que todavía no tienen su contacto. */
export async function pendientesDeContactos() {
  const r = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "RadarDoc" r
    WHERE r.col = 'prospectos' AND r.deleted = false
      AND NOT EXISTS (SELECT 1 FROM "Contact" c WHERE c."radarId" = r.id)`;
  return Number(r[0]?.n ?? 0);
}

/** Pasa a Contactos las empresas del Radar que todavía no están (de a tandas). Devuelve cuántas pasó. */
export async function espejarPendientes(max = 5000) {
  let total = 0;
  try {
    while (total < max) {
      const rows = await db.$queryRaw<Fila[]>`
        SELECT r.id, r.data FROM "RadarDoc" r
        WHERE r.col = 'prospectos' AND r.deleted = false
          AND NOT EXISTS (SELECT 1 FROM "Contact" c WHERE c."radarId" = r.id)
        ORDER BY r."updatedAt" LIMIT 500`;
      if (!rows.length) break;
      await espejar(rows);
      total += rows.length;
      if (rows.length < 500) break;
    }
  } catch (e) {
    console.error("espejarPendientes", e);
  }
  return total;
}
