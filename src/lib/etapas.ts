import { db } from "./db";
import type { Tone } from "./labels";

/** Las etapas de un cliente. Son las mismas en el Radar y en Contactos. */
export const ETAPAS: [string, string, Tone][] = [
  ["nuevo", "Nuevo", "neutral"],
  ["contactado", "Contactado", "info"],
  ["respondio", "Respondió", "ok"],
  ["cotizado", "Cotizado", "warn"],
  ["cliente", "Cliente", "ok"],
  ["descartado", "Descartado", "bad"],
];
export const etapaDe = (k: string | null | undefined) => ETAPAS.find(([x]) => x === (k || "nuevo")) ?? ETAPAS[0];

let ultima = 0;

/**
 * Pone al día la etapa de cada contacto. Los del Radar copian la de su empresa; los demás la sacan de lo que pasó:
 * si respondió, «Respondió»; si se le mandó algo, «Contactado»; si no, «Nuevo». Corre como mucho una vez cada 30 s.
 */
export async function sincronizarEtapas() {
  if (Date.now() - ultima < 30_000) return;
  ultima = Date.now();
  try {
    await db.$executeRaw`
      UPDATE "Contact" c SET etapa = coalesce(r.data->>'etapa', 'nuevo')
      FROM "RadarDoc" r
      WHERE r.col = 'prospectos' AND r.id = c."radarId" AND c.etapa IS DISTINCT FROM coalesce(r.data->>'etapa', 'nuevo')`;
    await db.$executeRaw`
      UPDATE "Contact" c SET etapa = x.etapa
      FROM (
        SELECT c2.id,
          CASE
            WHEN EXISTS (SELECT 1 FROM "Reply" rp WHERE rp."contactId" = c2.id) THEN 'respondio'
            WHEN EXISTS (SELECT 1 FROM "Message" m JOIN "Enrollment" e ON e.id = m."enrollmentId" WHERE e."contactId" = c2.id AND m.error IS NULL)
              OR EXISTS (SELECT 1 FROM "Actividad" a WHERE a."contactId" = c2.id AND a.canal IS NOT NULL) THEN 'contactado'
            ELSE 'nuevo'
          END AS etapa
        FROM "Contact" c2
        WHERE c2."radarId" IS NULL AND coalesce(c2.etapa, 'nuevo') NOT IN ('cotizado', 'cliente', 'descartado')
      ) x
      WHERE x.id = c.id AND c.etapa IS DISTINCT FROM x.etapa`;
  } catch (e) {
    console.error("sincronizar etapas", e);
  }
}
