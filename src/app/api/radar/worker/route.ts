import { NextResponse, after } from "next/server";
import { despertar, pendientes, procesar } from "@/lib/radar/worker";
import { autorizadoCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = { job?: { col: "busquedas" | "pedidos"; id: string }; pendientes?: boolean };

/**
 * Trabajador del Radar: sigue una búsqueda o un pedido en una invocación nueva (la anterior se quedó sin tiempo),
 * o retoma los que quedaron a medias. Lo llaman la propia app y el programador de GitHub (con su llave).
 */
export async function POST(req: Request) {
  if (!(await autorizadoCron(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Body;
  const hasta = Date.now() + 270_000;
  const jobs = body.job ? [body.job] : body.pendientes ? await pendientes() : [];
  if (!jobs.length) return NextResponse.json({ ok: true, jobs: 0 });
  const [primero, ...resto] = jobs;
  after(async () => {
    // cada trabajo en su propia invocación: los demás se despiertan aparte
    for (const j of resto) await despertar({ job: j });
    const r = await procesar(primero, hasta);
    if (r === "sigue") await despertar({ job: primero });
  });
  return NextResponse.json({ ok: true, jobs: jobs.length }, { status: 202 });
}

export const GET = POST;
