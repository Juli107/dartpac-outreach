import { NextResponse } from "next/server";
import { autorizadoCron } from "@/lib/cron-auth";
import { pasadaProgramador } from "@/lib/programador";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** El programador: lo llaman cron-job.org y GitHub cada 10 minutos (y Vercel una vez al día). */
export async function GET(req: Request) {
  if (!(await autorizadoCron(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  // ?bandeja=1 fuerza la lectura de los buzones; si no, se leen cada 5 minutos.
  return NextResponse.json(await pasadaProgramador({ bandeja: new URL(req.url).searchParams.has("bandeja"), fuente: "cron" }));
}
