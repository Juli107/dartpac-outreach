import { db } from "./db";

export function pct(part: number, total: number) {
  return total ? (part / total) * 100 : 0;
}

export function formatPct(v: number) {
  return v.toLocaleString("es-ES", { maximumFractionDigits: 1 }) + "%";
}

export async function overallStats(since: Date) {
  const where = { sentAt: { gte: since }, error: null };
  const [sent, opened, replies, bounced, meetings] = await Promise.all([
    db.message.count({ where }),
    db.message.count({ where: { ...where, openedAt: { not: null } } }),
    db.reply.count({ where: { receivedAt: { gte: since } } }),
    db.enrollment.count({ where: { status: "BOUNCED" } }),
    db.reply.count({ where: { receivedAt: { gte: since }, label: "MEETING" } }),
  ]);
  return { sent, opened, replies, bounced, meetings };
}

export async function sequenceStats() {
  const sequences = await db.sequence.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { enrollments: true, steps: true } } },
  });
  return Promise.all(
    sequences.map(async (s) => {
      const [sent, opened, replied, finished] = await Promise.all([
        db.message.count({ where: { enrollment: { sequenceId: s.id }, error: null } }),
        db.message.count({ where: { enrollment: { sequenceId: s.id }, openedAt: { not: null } } }),
        db.enrollment.count({ where: { sequenceId: s.id, status: "REPLIED" } }),
        db.enrollment.count({ where: { sequenceId: s.id, status: { in: ["FINISHED", "REPLIED", "BOUNCED", "UNSUBSCRIBED"] } } }),
      ]);
      const total = s._count.enrollments;
      return {
        ...s,
        sent,
        openRate: pct(opened, sent),
        replyRate: pct(replied, total),
        progress: pct(finished, total),
      };
    }),
  );
}

/** Envíos y respuestas por semana (lunes a domingo), de la más antigua a la actual. */
export async function weeklySeries(weeks = 8) {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = new Date(monday.getTime() - (weeks - 1) * 7 * 86400_000);
  const [messages, replies] = await Promise.all([
    db.message.findMany({ where: { sentAt: { gte: start }, error: null }, select: { sentAt: true } }),
    db.reply.findMany({ where: { receivedAt: { gte: start } }, select: { receivedAt: true } }),
  ]);
  const series = Array.from({ length: weeks }, (_, i) => ({
    week: new Date(start.getTime() + i * 7 * 86400_000),
    sent: 0,
    replies: 0,
  }));
  const idx = (d: Date) => Math.floor((d.getTime() - start.getTime()) / (7 * 86400_000));
  for (const m of messages) series[idx(m.sentAt)] && series[idx(m.sentAt)].sent++;
  for (const r of replies) series[idx(r.receivedAt)] && series[idx(r.receivedAt)].replies++;
  return series;
}
