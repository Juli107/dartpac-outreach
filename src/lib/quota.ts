import { db } from "./db";
import { startOfLocalDay, windowFromEnv } from "./schedule";

export function todayStart(now = new Date()) {
  return startOfLocalDay(now, windowFromEnv().timeZone);
}

/** Emails enviados hoy, por secuencia y por buzón. */
export async function sentToday(now = new Date()) {
  const rows = await db.message.findMany({
    where: { sentAt: { gte: todayStart(now) }, error: null },
    select: { fromEmail: true, sentAt: true, enrollment: { select: { sequenceId: true } } },
  });
  const bySequence = new Map<string, number>();
  const byMailbox = new Map<string, number>();
  const lastByMailbox = new Map<string, Date>();
  for (const r of rows) {
    bySequence.set(r.enrollment.sequenceId, (bySequence.get(r.enrollment.sequenceId) ?? 0) + 1);
    const box = r.fromEmail.toLowerCase();
    byMailbox.set(box, (byMailbox.get(box) ?? 0) + 1);
    if (r.sentAt > (lastByMailbox.get(box) ?? new Date(0))) lastByMailbox.set(box, r.sentAt);
  }
  return { bySequence, byMailbox, lastByMailbox };
}

/** Emails que faltan por enviar a los contactos activos o pausados, por secuencia. */
export async function pendingEmails(sequenceIds?: string[]) {
  const [enrollments, steps] = await Promise.all([
    db.enrollment.findMany({
      where: { status: { in: ["ACTIVE", "PAUSED"] }, ...(sequenceIds ? { sequenceId: { in: sequenceIds } } : {}) },
      select: { sequenceId: true, nextStep: true },
    }),
    db.step.findMany({
      where: { type: "EMAIL", ...(sequenceIds ? { sequenceId: { in: sequenceIds } } : {}) },
      select: { sequenceId: true, order: true },
    }),
  ]);
  const pending = new Map<string, number>();
  for (const e of enrollments) {
    const left = steps.filter((s) => s.sequenceId === e.sequenceId && s.order >= e.nextStep).length;
    pending.set(e.sequenceId, (pending.get(e.sequenceId) ?? 0) + left);
  }
  return pending;
}

/** Días hábiles aproximados para vaciar la cola al ritmo permitido. */
export function daysToFinish(pending: number, perDay: number) {
  return perDay > 0 ? Math.ceil(pending / perDay) : Infinity;
}

/**
 * Minutos mínimos entre dos envíos del mismo buzón: reparte su cupo diario a lo largo
 * del horario de envío en vez de mandarlo de golpe, que es lo que delata a un robot.
 */
export function minGapMinutes(dailyLimit: number, startHour: number, endHour: number) {
  const windowMinutes = Math.max(60, (endHour - startHour) * 60);
  return Math.max(2, Math.floor(windowMinutes / Math.max(1, dailyLimit)));
}
