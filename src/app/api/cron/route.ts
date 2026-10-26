import { NextResponse, after } from "next/server";
import { autorizadoCron } from "@/lib/cron-auth";
import { pasadaProgramador, semanalSiHaceFalta } from "@/lib/programador";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * El programador: lo llama cron-job.org cada 10 minutos (con GitHub de respaldo y Vercel una vez al día).
 * Contesta enseguida y trabaja después de responder: cron-job.org corta a los 30 segundos y, si falla más de
 * 25 veces seguidas, desactiva la tarea. Con ?esperar=1 espera la pasada y devuelve el resultado (para revisar a mano).
 * Los lunes, además, lanza la búsqueda automática del Radar si todavía no corrió.
 */
export async function GET(req: Request) {
  if (!(await autorizadoCron(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const q = new URL(req.url).searchParams;
  // ?bandeja=1 fuerza la lectura de los buzones; si no, se leen cada 5 minutos.
  const pasada = async () => {
    const r = await pasadaProgramador({ bandeja: q.has("bandeja"), fuente: "cron" });
    const semanal = await semanalSiHaceFalta().catch((e) => ({ error: String(e) }));
    return { ...r, ...(semanal ? { semanal } : {}) };
  };
  if (q.has("esperar")) return NextResponse.json(await pasada());
  after(() => pasada().catch((e) => console.error("programador", e)));
  return NextResponse.json({ ok: true, empezada: new Date().toISOString() });
}
