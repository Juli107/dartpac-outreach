import { NextResponse } from "next/server";
import { runDueSteps } from "@/lib/engine";
import { syncInbox } from "@/lib/inbox";
import { recordRun } from "@/lib/settings";
import { autorizadoCron } from "@/lib/cron-auth";
import { despertar, pendientes } from "@/lib/radar/worker";
import { tomarTurno } from "@/lib/turno";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await autorizadoCron(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  // Una pasada a la vez: el programador externo y el de GitHub pueden llegar juntos.
  const soltar = await tomarTurno("programador", (maxDuration + 15) * 1000);
  if (!soltar) return NextResponse.json({ omitida: "Otra pasada del programador está en curso." });
  try {
    // Primero las respuestas, para no enviar un seguimiento a quien acaba de contestar.
    // Con un cron cada minuto los buzones se revisan cada 5; ?bandeja=1 fuerza la revisión.
    const checkInbox = new URL(req.url).searchParams.has("bandeja") || new Date().getUTCMinutes() % 5 === 0;
    const inbox = checkInbox ? await syncInbox().catch((e) => ({ error: String(e) })) : "omitida";
    const steps = await runDueSteps();
    await recordRun({ at: new Date().toISOString(), steps, inbox, source: "cron" }).catch(() => undefined);
    // Búsquedas del Radar que quedaron a medias (por ejemplo, si se cortó la cadena): se retoman.
    const radar = await pendientes()
      .then(async (jobs) => {
        if (jobs.length) await despertar({ pendientes: true });
        return jobs.length;
      })
      .catch(() => 0);
    return NextResponse.json({ inbox, steps, radar });
  } finally {
    await soltar();
  }
}
