import { db } from "./db";
import { startOfLocalDay, windowFromEnv } from "./schedule";

/** Cupo del buzón general (secuencias sin remitente asignado). */
export function generalMailbox() {
  return { email: (process.env.SMTP_USER ?? "").toLowerCase(), dailyLimit: Number(process.env.GENERAL_DAILY_LIMIT ?? 50) };
}

export function todayStart(now = new Date()) {
  return startOfLocalDay(now, windowFromEnv().timeZone);
}

/** Emails enviados hoy, por secuencia y por buzón. */
export async function sentToday(now = new Date()) {
  const rows = await db.message.findMany({
    where: { sentAt: { gte: todayStart(now) }, error: null },
    select: { fromEmail: true, enrollment: { select: { sequenceId: true } } },
  });
  const bySequence = new Map<string, number>();
  const byMailbox = new Map<string, number>();
  for (const r of rows) {
    bySequence.set(r.enrollment.sequenceId, (bySequence.get(r.enrollment.sequenceId) ?? 0) + 1);
    const box = r.fromEmail.toLowerCase();
    byMailbox.set(box, (byMailbox.get(box) ?? 0) + 1);
  }
  return { bySequence, byMailbox };
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
