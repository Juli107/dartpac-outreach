export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

/** Encender una secuencia envía correos reales: se pide confirmación siempre. */
export const CONFIRM_ON = "Al encenderla empezará a enviar correos reales a sus contactos, dentro de su horario y con sus límites. ¿Encender?";

export const TIME_ZONES: [string, string][] = [
  ["America/Argentina/Buenos_Aires", "Argentina (Buenos Aires)"],
  ["America/Montevideo", "Uruguay (Montevideo)"],
  ["America/Santiago", "Chile (Santiago)"],
  ["America/Sao_Paulo", "Brasil (São Paulo)"],
  ["America/Asuncion", "Paraguay (Asunción)"],
  ["America/Lima", "Perú (Lima)"],
  ["America/Bogota", "Colombia (Bogotá)"],
  ["America/Mexico_City", "México (CDMX)"],
  ["Europe/Madrid", "España (Madrid)"],
];

export const DAYS: [number, string][] = [[1, "L"], [2, "M"], [3, "X"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]];

/** "Argentina · L–V · 8–19 h" */
export function scheduleLabel(sq: { timeZone: string; startHour: number; endHour: number; sendDays: number[] }) {
  const zone = (TIME_ZONES.find(([z]) => z === sq.timeZone)?.[1] ?? sq.timeZone).split(" (")[0];
  const d = [...sq.sendDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const weekdays = d.join() === "1,2,3,4,5";
  const days = weekdays ? "L–V" : d.length === 7 ? "Todos los días" : d.map((n) => DAYS.find(([k]) => k === n)?.[1]).join(" ");
  return `${zone} · ${days} · ${sq.startHour}–${sq.endHour} h`;
}

export const SEQUENCE_STATUS: Record<string, [string, Tone]> = {
  DRAFT: ["Borrador", "info"],
  ACTIVE: ["Activa", "ok"],
  PAUSED: ["Pausada", "warn"],
  ARCHIVED: ["Archivada", "neutral"],
};

export const ENROLLMENT_STATUS: Record<string, [string, Tone]> = {
  ACTIVE: ["En curso", "info"],
  PAUSED: ["Pausado", "warn"],
  REPLIED: ["Respondió", "ok"],
  FINISHED: ["Terminado", "neutral"],
  BOUNCED: ["Rebotado", "bad"],
  UNSUBSCRIBED: ["Baja", "bad"],
};

export const REPLY_LABEL: Record<string, [string, Tone]> = {
  NEW: ["Sin clasificar", "info"],
  INTERESTED: ["Interesado", "ok"],
  MEETING: ["Reunión", "ok"],
  LATER: ["Más adelante", "warn"],
  NOT_INTERESTED: ["No interesado", "bad"],
};

export function fullName(c: { firstName?: string | null; lastName?: string | null; email?: string | null; company?: string | null; phone?: string | null }) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || c.phone || "Sin nombre";
}

export function relativeTime(d: Date) {
  const diff = (Date.now() - d.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

export function formatDate(d: Date) {
  return d.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: process.env.SEND_TIMEZONE ?? "America/Argentina/Buenos_Aires" });
}

/** Nombre libre para una copia: «X (copia)», y si ya está, «X (copia 2)», «X (copia 3)»… */
export function nombreDeCopia(nombre: string, usados: Iterable<string>) {
  const raiz = nombre.replace(/\s+\(copia(?: \d+)?\)$/i, "").trim() || nombre;
  const ya = new Set(usados);
  for (let n = 1; n < 1000; n++) {
    const candidato = `${raiz} (copia${n > 1 ? ` ${n}` : ""})`;
    if (!ya.has(candidato)) return candidato;
  }
  return `${raiz} (copia)`;
}
