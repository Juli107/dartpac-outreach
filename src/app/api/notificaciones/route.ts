import { NextResponse } from "next/server";
import { notificaciones } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Avisos para la campanita: respuestas, tareas, salud de los envíos, correos con problemas y el Radar. */
export async function GET() {
  return NextResponse.json(await notificaciones(), { headers: { "Cache-Control": "no-store" } });
}
