import { NextResponse, after } from "next/server";
import { latido } from "@/lib/programador";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * El latido de Outreach: cron-job.org lo llama cada 10 minutos, sin llave. Contesta al instante (cron-job.org corta a
 * los 30 segundos) y después hace la pasada que falte y la búsqueda de los lunes. No devuelve datos.
 */
export async function GET() {
  after(() => latido().catch((e) => console.error("latido", e)));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
