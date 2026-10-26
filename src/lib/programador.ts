import { runDueSteps } from "./engine";
import { syncInbox } from "./inbox";
import { lastRun, recordRun, type RunReport } from "./settings";
import { cronShouldRun } from "./health";
import { tomarTurno } from "./turno";
import { despertar, pendientes } from "./radar/worker";
import { armarSemanal, esHoraSemanal } from "./radar/semanal";
import { getDoc, hoyAR } from "./radar/store";

/** Una pasada dura como mucho lo que la función de /api/cron (60 s) y un margen. */
const TURNO_MS = 75_000;
/** El programador pasa cada 10 minutos; si la última pasada fue hace menos de 9, no hace falta otra. */
const CADA_MS = 9 * 60_000;

/**
 * Una pasada del programador: primero las respuestas (para no mandarle un seguimiento a quien acaba de contestar),
 * después los pasos que tocan y las búsquedas del Radar que quedaron a medias. Un solo turno a la vez.
 */
export async function pasadaProgramador(opts: { bandeja?: boolean; fuente: RunReport["source"] }) {
  const soltar = await tomarTurno("programador", TURNO_MS);
  if (!soltar) return { omitida: "Otra pasada del programador está en curso." };
  try {
    const checkInbox = opts.bandeja || new Date().getUTCMinutes() % 5 === 0;
    const inbox = checkInbox ? await syncInbox().catch((e) => ({ error: String(e) })) : "omitida";
    const steps = await runDueSteps();
    await recordRun({ at: new Date().toISOString(), steps, inbox, source: opts.fuente }).catch(() => undefined);
    const radar = await pendientes()
      .then(async (jobs) => {
        if (jobs.length) await despertar({ pendientes: true });
        return jobs.length;
      })
      .catch(() => 0);
    return { inbox, steps, radar };
  } finally {
    await soltar();
  }
}

/**
 * El programador de respaldo que no depende de nadie de afuera: mientras alguien tenga la app abierta
 * (la campanita consulta cada minuto), si en horario de envíos pasaron 9 minutos sin pasada, hace una.
 * Los lunes, además, lanza la búsqueda automática del Radar si todavía no corrió.
 */
export async function programadorSiHaceFalta(now = new Date()) {
  if (cronShouldRun(now)) {
    const { at } = await lastRun();
    if (!at || now.getTime() - at.getTime() >= CADA_MS) await pasadaProgramador({ bandeja: true, fuente: "app" });
  }
  await semanalSiHaceFalta(now);
}

/**
 * La búsqueda automática de los lunes, si ya es la hora y todavía no corrió hoy. La piden el programador externo
 * (cada 10 minutos) y la app; armarSemanal reserva el día, así que corre una sola vez.
 */
export async function semanalSiHaceFalta(now = new Date()) {
  if (!esHoraSemanal(now)) return null;
  const marca = await getDoc("config", "semanal");
  if (marca?.data.ultima === hoyAR(now)) return null;
  const { jobs, ...r } = await armarSemanal();
  for (const job of jobs) await despertar({ job });
  return r;
}
