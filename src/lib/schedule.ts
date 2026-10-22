/** Horario de envío. `days` usa 0 = domingo … 6 = sábado; sin `days`, de lunes a viernes. */
export type SendWindow = { startHour: number; endHour: number; timeZone: string; days?: number[] };

export const WEEKDAYS = [1, 2, 3, 4, 5];
const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function windowFromEnv(): SendWindow {
  return {
    startHour: Number(process.env.SEND_HOUR_START ?? 8),
    endHour: Number(process.env.SEND_HOUR_END ?? 19),
    timeZone: process.env.SEND_TIMEZONE ?? "America/Argentina/Buenos_Aires",
  };
}

/** Horario propio de una secuencia. */
export function windowFor(sq: { timeZone: string; startHour: number; endHour: number; sendDays: number[] }): SendWindow {
  return { timeZone: sq.timeZone, startHour: sq.startHour, endHour: sq.endHour, days: sq.sendDays.length ? sq.sendDays : WEEKDAYS };
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")) };
}

export function isInWindow(date: Date, w: SendWindow): boolean {
  const { weekday, hour } = localParts(date, w.timeZone);
  if (!(w.days ?? WEEKDAYS).includes(DAY_INDEX[weekday])) return false;
  return hour >= w.startHour && hour < w.endHour;
}

const STEP_MS = 15 * 60 * 1000;

/**
 * Primer momento dentro del horario (días y horas de envío) a partir de `from` + `delayDays`.
 * Avanza en tramos de 15 minutos, así respeta cambios de hora sin librerías.
 */
export function nextSendTime(from: Date, delayDays: number, w: SendWindow): Date {
  let t = new Date(from.getTime() + delayDays * 24 * 60 * 60 * 1000);
  for (let i = 0; i < 4 * 24 * 8; i++) {
    if (isInWindow(t, w)) return t;
    t = new Date(Math.floor(t.getTime() / STEP_MS) * STEP_MS + STEP_MS);
  }
  return t;
}

/** Medianoche de hoy en la zona horaria de envío (los cupos diarios se reinician a esa hora). */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + date.getMilliseconds();
  return new Date(date.getTime() - elapsed);
}
