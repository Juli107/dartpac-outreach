import { cargarEnvios } from "@/lib/stats";
import { csvEnvios } from "@/lib/analisis";
import { desdePeriodo } from "@/lib/periodo";

export const dynamic = "force-dynamic";

/** Descarga de una fila por email enviado (con su respuesta), para analizar en Excel. Requiere sesión (middleware). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("p");
  const envios = await cargarEnvios(desdePeriodo(p));
  // BOM para que Excel lea bien las tildes
  return new Response("﻿" + csvEnvios(envios), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="envios-y-respuestas-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
