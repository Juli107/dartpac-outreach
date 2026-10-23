import { db } from "../db";
import { provNom } from "./geo";
import { radarHoyCount } from "./store";

/** Cifras del Radar para el Panel (calculadas en la base, sin traer todas las fichas). */
export async function radarResumen() {
  const semana = Date.now() - 7 * 86400_000;
  try {
    const [tot, prov, vivas, hoy] = await Promise.all([
      db.$queryRaw<{ total: bigint; conv: bigint; semana: bigint }[]>`
        SELECT count(*)::bigint AS total,
          count(*) FILTER (WHERE data->>'etapa' IN ('respondio', 'cotizado'))::bigint AS conv,
          count(*) FILTER (WHERE (CASE WHEN jsonb_typeof(data->'creado') = 'number' THEN (data->>'creado')::numeric ELSE 0 END) > ${semana})::bigint AS semana
        FROM "RadarDoc" WHERE col = 'prospectos' AND deleted = false`,
      db.$queryRaw<{ p: string | null; c: bigint }[]>`
        SELECT data->>'provincia' AS p, count(*)::bigint AS c FROM "RadarDoc"
        WHERE col = 'prospectos' AND deleted = false GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      db.$queryRaw<{ p: string | null; progreso: string | null }[]>`
        SELECT data->>'provincia' AS p, data->>'progreso' AS progreso FROM "RadarDoc"
        WHERE col = 'busquedas' AND deleted = false AND data->>'estado' IN ('pendiente', 'buscando')
          AND greatest(
            CASE WHEN jsonb_typeof(data->'latido') = 'number' THEN (data->>'latido')::numeric ELSE 0 END,
            CASE WHEN jsonb_typeof(data->'inicio') = 'number' THEN (data->>'inicio')::numeric ELSE 0 END,
            CASE WHEN jsonb_typeof(data->'t') = 'number' THEN (data->>'t')::numeric ELSE 0 END) > ${Date.now() - 30 * 60_000}`,
      radarHoyCount(),
    ]);
    return {
      total: Number(tot[0]?.total ?? 0),
      conversacion: Number(tot[0]?.conv ?? 0),
      semana: Number(tot[0]?.semana ?? 0),
      hoy,
      porProvincia: prov.filter((r) => r.p).map((r) => ({ n: provNom(r.p), c: Number(r.c) })),
      buscando: [...new Set(vivas.map((v) => provNom(v.p)))],
      progreso: vivas.find((v) => v.progreso)?.progreso ?? "",
    };
  } catch {
    return { total: 0, conversacion: 0, semana: 0, hoy: 0, porProvincia: [], buscando: [] as string[], progreso: "" };
  }
}
