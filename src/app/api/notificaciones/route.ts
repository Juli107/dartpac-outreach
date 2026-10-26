import { NextResponse, after } from "next/server";
import { notificaciones } from "@/lib/notifications";
import { programadorSiHaceFalta } from "@/lib/programador";

export const dynamic = "force-dynamic";
// La campanita consulta cada minuto: si el programador externo no pasó, la pasada de respaldo corre acá (hasta 60 s).
export const maxDuration = 60;

/** Avisos para la campanita: respuestas, tareas, salud de los envíos, correos con problemas y el Radar. */
export async function GET() {
  after(() => programadorSiHaceFalta().catch((e) => console.error("programador de respaldo", e)));
  return NextResponse.json(await notificaciones(), { headers: { "Cache-Control": "no-store" } });
}
