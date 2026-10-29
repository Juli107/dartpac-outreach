import { NextResponse, after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { espejarProspectos } from "@/lib/radar/espejo";
import { setDoc, validPath, type RadarData } from "@/lib/radar/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  docs: z.array(z.object({ c: z.string(), id: z.string(), d: z.record(z.unknown()) })).min(1).max(400),
});

const marca = (d: RadarData) => Number(d.actualizado ?? d.fin ?? d.t ?? d.creado ?? 0) || 0;

/**
 * Carga la base del Radar exportada desde Claude (en tandas). Agrega lo que falta y, si un documento ya existe,
 * se queda con la versión más nueva. Nunca borra nada.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument", detail: "El archivo no tiene el formato esperado." }, { status: 400 });
  let nuevos = 0, actualizados = 0, iguales = 0;
  const existing = await db.radarDoc.findMany({
    where: { OR: parsed.data.docs.map((x) => ({ col: x.c, id: x.id })) },
    select: { col: true, id: true, data: true, deleted: true },
  });
  const byKey = new Map(existing.map((e) => [`${e.col}/${e.id}`, e]));
  for (const x of parsed.data.docs) {
    if (!validPath(x.c, x.id)) continue;
    const cur = byKey.get(`${x.c}/${x.id}`);
    if (!cur || cur.deleted) {
      await setDoc(x.c, x.id, x.d);
      nuevos++;
    } else if (marca(x.d) > marca(cur.data as RadarData)) {
      await setDoc(x.c, x.id, x.d);
      actualizados++;
    } else iguales++;
  }
  const aContactos = parsed.data.docs.filter((x) => x.c === "prospectos").map((x) => x.id);
  if (aContactos.length) after(() => espejarProspectos(aContactos));
  return NextResponse.json({ ok: true, nuevos, actualizados, iguales });
}

/** Cuántos documentos hay por colección (para saber si falta importar). */
export async function GET() {
  const rows = await db.radarDoc.groupBy({ by: ["col"], where: { deleted: false }, _count: true });
  return NextResponse.json({ colecciones: Object.fromEntries(rows.map((r) => [r.col, r._count])) });
}
