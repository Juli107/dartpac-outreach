export type SendWindow = { startHour: number; endHour: number; timeZone: string };

export function windowFromEnv(): SendWindow {
  return {
    startHour: Number(process.env.SEND_HOUR_START ?? 8),
    endHour: Number(process.env.SEND_HOUR_END ?? 19),
    timeZone: process.env.SEND_TIMEZONE ?? "America/Argentina/Buenos_Aires",
  };
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
  if (weekday === "Sat" || weekday === "Sun") return false;
  return hour >= w.startHour && hour < w.endHour;
}

const STEP_MS = 15 * 60 * 1000;

/**
 * Primer momento hábil (lunes a viernes, dentro del horario) a partir de `from` + `delayDays`.
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
