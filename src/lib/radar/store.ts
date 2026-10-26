import { Prisma } from "@prisma/client";
import { db } from "../db";

/**
 * Base del Radar comercial: documentos JSON por colección, con la misma forma que tenían dentro de Claude
 * (prospectos, busquedas, alertas, pedidos, config/empresa, config/excluir). Escrituras con número de versión:
 * `update` mezcla los campos de primer nivel y `{__delete__: true}` borra un campo.
 */
export type RadarData = Record<string, unknown>;
export type RadarRow = { col: string; id: string; data: RadarData; v: number; deleted: boolean; updatedAt: Date };

export const COLLECTIONS = new Set(["prospectos", "busquedas", "alertas", "pedidos", "config", "secuencias"]);
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

export function validPath(col: string, id: string) {
  return COLLECTIONS.has(col) && ID_RE.test(id) && id !== "." && id !== "..";
}

const isDelete = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v) && (v as RadarData).__delete__ === true;

/** Quita los marcadores de borrado anidados (no se guardan nunca). */
function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") {
    const out: RadarData = {};
    for (const [k, x] of Object.entries(v as RadarData)) if (!isDelete(x)) out[k] = clean(x);
    return out;
  }
  return v;
}

export function mergeTop(base: RadarData, patch: RadarData): RadarData {
  const out: RadarData = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (isDelete(v)) delete out[k];
    else out[k] = clean(v);
  }
  return out;
}

const asJson = (d: RadarData) => d as Prisma.InputJsonValue;

export async function getDoc(col: string, id: string): Promise<{ data: RadarData; v: number } | null> {
  const r = await db.radarDoc.findUnique({ where: { col_id: { col, id } } });
  if (!r || r.deleted) return null;
  return { data: r.data as RadarData, v: r.v };
}

/** Reemplaza el documento entero (o lo crea). */
export async function setDoc(col: string, id: string, data: RadarData) {
  const clean0 = clean(data) as RadarData;
  const r = await db.radarDoc.upsert({
    where: { col_id: { col, id } },
    create: { col, id, data: asJson(clean0) },
    update: { data: asJson(clean0), deleted: false, v: { increment: 1 } },
    select: { v: true },
  });
  return r.v;
}

/**
 * Altas en bloque (importar una base): los documentos que todavía no existen entran en una sola consulta; los que ya
 * existían (raro: otro los creó en el medio) se reemplazan uno por uno. Devuelve la versión de cada uno, en orden.
 */
export async function setDocs(col: string, docs: { id: string; data: RadarData }[]) {
  const existentes = new Set(
    (await db.radarDoc.findMany({ where: { col, id: { in: docs.map((d) => d.id) } }, select: { id: true } })).map((r) => r.id),
  );
  const nuevos = docs.filter((d) => !existentes.has(d.id));
  const v = new Map<string, number>();
  if (nuevos.length) {
    await db.radarDoc.createMany({ data: nuevos.map((d) => ({ col, id: d.id, data: asJson(clean(d.data) as RadarData) })), skipDuplicates: true });
    for (const d of nuevos) v.set(d.id, 1);
  }
  for (const d of docs) if (existentes.has(d.id)) v.set(d.id, await setDoc(col, d.id, d.data));
  return docs.map((d) => v.get(d.id) ?? 1);
}

/** Bajas en bloque (eliminar las empresas marcadas): una sola consulta. */
export async function deleteDocs(col: string, ids: string[]) {
  await db.radarDoc.updateMany({ where: { col, id: { in: ids }, deleted: false }, data: { deleted: true, data: {}, v: { increment: 1 } } });
}

/**
 * Cambios en bloque (los mismos campos o distintos para cada una): una sola consulta que mezcla los campos de primer
 * nivel, igual que updateDoc sin versión. Los que no existen se ignoran. Devuelve la versión nueva de cada uno.
 */
export async function updateDocs(col: string, docs: { id: string; data: RadarData }[]) {
  const lote = JSON.stringify(docs.map((d) => ({ id: d.id, patch: clean(d.data) })));
  const rows = await db.$queryRaw<{ id: string; v: number }[]>`
    UPDATE "RadarDoc" AS r SET data = r.data || x.patch, v = r.v + 1, "updatedAt" = now()
    FROM jsonb_to_recordset(${lote}::jsonb) AS x(id text, patch jsonb)
    WHERE r.col = ${col} AND r.id = x.id AND r.deleted = false
    RETURNING r.id, r.v`;
  const v = new Map(rows.map((r) => [r.id, Number(r.v)]));
  return docs.map((d) => v.get(d.id));
}

/** ¿Hay algún «borrar este campo» ({__delete__: true}) en el cambio? Esos van por updateDoc, uno por uno. */
export function borraCampos(d: unknown): boolean {
  if (Array.isArray(d)) return d.some(borraCampos);
  if (d && typeof d === "object") return isDelete(d) || Object.values(d as RadarData).some(borraCampos);
  return false;
}

export class VersionConflict extends Error {}

/**
 * Mezcla campos de primer nivel. Con `ifVersion` falla si alguien lo cambió en el medio;
 * sin él reintenta sola hasta que entra (último que escribe gana, campo por campo).
 */
export async function updateDoc(col: string, id: string, patch: RadarData | ((d: RadarData) => RadarData | null), opts: { ifVersion?: number; create?: boolean } = {}) {
  for (let i = 0; i < 6; i++) {
    const cur = await db.radarDoc.findUnique({ where: { col_id: { col, id } } });
    if (!cur || cur.deleted) {
      if (!opts.create) throw new NotFound(`${col}/${id}`);
      const data = typeof patch === "function" ? patch({}) : mergeTop({}, patch);
      if (!data) return null;
      try {
        if (cur) {
          const n = await db.radarDoc.updateMany({ where: { col, id, v: cur.v }, data: { data: asJson(data), deleted: false, v: cur.v + 1 } });
          if (n.count) return cur.v + 1;
        } else {
          await db.radarDoc.create({ data: { col, id, data: asJson(data) } });
          return 1;
        }
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
      continue;
    }
    if (opts.ifVersion != null && opts.ifVersion !== cur.v) throw new VersionConflict(`${col}/${id} cambió (v${cur.v})`);
    const base = cur.data as RadarData;
    const next = typeof patch === "function" ? patch(base) : mergeTop(base, patch);
    if (!next) return cur.v;
    const n = await db.radarDoc.updateMany({ where: { col, id, v: cur.v }, data: { data: asJson(next), v: cur.v + 1 } });
    if (n.count) return cur.v + 1;
    if (opts.ifVersion != null) throw new VersionConflict(`${col}/${id} cambió`);
  }
  throw new VersionConflict(`${col}/${id}: demasiados cambios a la vez`);
}

export class NotFound extends Error {}

export async function deleteDoc(col: string, id: string) {
  await db.radarDoc.updateMany({ where: { col, id, deleted: false }, data: { deleted: true, data: {}, v: { increment: 1 } } });
}

/** Todos los documentos vivos de una colección. */
export async function listCol(col: string) {
  const rows = await db.radarDoc.findMany({ where: { col, deleted: false }, select: { id: true, data: true, v: true } });
  return rows.map((r) => ({ id: r.id, v: r.v, data: r.data as RadarData }));
}

/**
 * Cambios desde `since` (ms). Se piden 5 s de más por si una escritura terminó tarde; el navegador descarta
 * lo que ya tiene por número de versión. Los borrados viajan como `d: null`.
 */
export async function changesSince(since: number) {
  const where = since > 0 ? { updatedAt: { gt: new Date(since - 5000) } } : { deleted: false };
  const now = Date.now();
  const rows = await db.radarDoc.findMany({ where, orderBy: { updatedAt: "asc" } });
  return {
    now,
    docs: rows.map((r) => ({ c: r.col, id: r.id, v: r.v, d: r.deleted ? null : (r.data as RadarData) })),
  };
}

/** Hoy en Argentina, como AAAA-MM-DD (así guarda el Radar sus fechas). */
export function hoyAR(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Empresas para contactar hoy: seguimientos que vencen hoy o antes (sin clientes ni descartadas). */
export async function radarHoyCount() {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "RadarDoc"
    WHERE col = 'prospectos' AND deleted = false
      AND coalesce(data->>'proximo', '') <> '' AND data->>'proximo' <= ${hoyAR()}
      AND coalesce(data->>'etapa', 'nuevo') NOT IN ('cliente', 'descartado')
      AND coalesce(jsonb_typeof(data->'noContactar'), 'null') = 'null'`;
  return Number(rows[0]?.n ?? 0);
}

/** Agrega una línea al historial de una empresa (y otros cambios). No falla si la empresa ya no existe. */
export async function touchProspect(id: string, entry: { tipo: string; texto: string; por?: string } | null, extra: RadarData | ((p: RadarData) => RadarData) = {}) {
  try {
    await updateDoc("prospectos", id, (p) => {
      const add = typeof extra === "function" ? extra(p) : extra;
      const historial = Array.isArray(p.historial) ? [...(p.historial as unknown[])] : [];
      if (entry) historial.push({ t: Date.now(), tipo: entry.tipo, texto: entry.texto, por: entry.por ?? "Outreach" });
      return mergeTop(p, { ...add, ...(entry ? { historial } : {}), actualizado: Date.now() });
    });
  } catch (e) {
    if (!(e instanceof NotFound)) throw e;
  }
}
