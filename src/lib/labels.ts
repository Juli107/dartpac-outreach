export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

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

export function fullName(c: { firstName?: string | null; lastName?: string | null; email: string }) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;
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
