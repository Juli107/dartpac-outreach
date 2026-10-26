import { NextResponse, after } from "next/server";
import { autorizadoCron } from "@/lib/cron-auth";
import { armarSemanal } from "@/lib/radar/semanal";
import { despertar, procesar } from "@/lib/radar/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Búsqueda automática de los lunes (la llaman cron-job.org y GitHub; la app también la lanza sola si hace falta). */
export async function POST(req: Request) {
  if (!(await autorizadoCron(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { jobs, ...resp } = await armarSemanal({ forzar: new URL(req.url).searchParams.has("forzar") });
  if (jobs.length) {
    const hasta = Date.now() + 270_000;
    const [primero, ...resto] = jobs;
    after(async () => {
      for (const j of resto) await despertar({ job: j });
      const r = await procesar(primero, hasta);
      if (r === "sigue") await despertar({ job: primero });
    });
  }
  return NextResponse.json(resp);
}

export const GET = POST;
