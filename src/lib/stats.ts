import { db } from "./db";
import { sentToday, pendingEmails } from "./quota";
import { stepVariants } from "./variants";
import { atribuir } from "./analisis";

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

/** Cifras de cada secuencia para la lista: personas, contactados, abiertos, respondidos, rebotados, sin leer. */
export async function sequenceStats() {
  const sequences = await db.sequence.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { enrollments: true, steps: true } }, sender: { select: { name: true, email: true } }, steps: { include: { variants: true } } },
  });
  const [today, pending] = await Promise.all([sentToday(), pendingEmails(sequences.map((s) => s.id))]);
  return Promise.all(
    sequences.map(async (s) => {
      const inSeq = { enrollments: { some: { sequenceId: s.id } } };
      const [sent, contacted, opened, replied, bounced, finished, unread] = await Promise.all([
        db.message.count({ where: { enrollment: { sequenceId: s.id }, error: null } }),
        db.enrollment.count({ where: { sequenceId: s.id, messages: { some: { error: null } } } }),
        db.enrollment.count({ where: { sequenceId: s.id, messages: { some: { openedAt: { not: null } } } } }),
        db.enrollment.count({ where: { sequenceId: s.id, status: "REPLIED" } }),
        db.enrollment.count({ where: { sequenceId: s.id, status: "BOUNCED" } }),
        db.enrollment.count({ where: { sequenceId: s.id, status: { in: ["FINISHED", "REPLIED", "BOUNCED", "UNSUBSCRIBED"] } } }),
        db.reply.count({ where: { read: false, contact: inSeq } }),
      ]);
      const total = s._count.enrollments;
      return {
        ...s,
        sent,
        contacted,
        opened,
        replied,
        bounced,
        unread,
        pending: pending.get(s.id) ?? 0,
        today: today.bySequence.get(s.id) ?? 0,
        openRate: pct(opened, contacted),
        replyRate: pct(replied, contacted),
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

export type Funnel = { sent: number; opened: number; replied: number };

/**
 * Enviados, abiertos y respondidos por paso y variante (clave "stepId:variante") y por paso ("stepId").
 * Una respuesta cuenta para el email al que contesta (cabecera In-Reply-To).
 */
export async function variantStats(sequenceId: string) {
  const [messages, replies] = await Promise.all([
    db.message.findMany({ where: { enrollment: { sequenceId }, error: null }, select: { stepId: true, variant: true, openedAt: true, messageId: true } }),
    db.reply.findMany({ where: { inReplyTo: { not: null }, contact: { enrollments: { some: { sequenceId } } } }, select: { inReplyTo: true } }),
  ]);
  const answered = new Set(replies.map((r) => r.inReplyTo));
  const map = new Map<string, Funnel>();
  const bump = (key: string, opened: boolean, replied: boolean) => {
    const f = map.get(key) ?? { sent: 0, opened: 0, replied: 0 };
    f.sent++;
    if (opened) f.opened++;
    if (replied) f.replied++;
    map.set(key, f);
  };
  for (const m of messages) {
    const opened = !!m.openedAt;
    const replied = answered.has(m.messageId);
    bump(`${m.stepId}:${m.variant}`, opened, replied);
    bump(m.stepId, opened, replied);
  }
  return map;
}

/**
 * Todos los emails enviados (desde `since`, si se da) con sus datos para comparar y la respuesta que les tocó.
 * Ver lib/analisis.ts.
 */
export async function cargarEnvios(since?: Date) {
  const where = { error: null, ...(since ? { sentAt: { gte: since } } : {}) };
  const [messages, senders] = await Promise.all([
    db.message.findMany({
      where,
      select: {
        id: true,
        messageId: true,
        sentAt: true,
        openedAt: true,
        variant: true,
        threaded: true,
        subject: true,
        fromEmail: true,
        step: { select: { order: true, subject: true, body: true, variants: { select: { label: true, subject: true, body: true } } } },
        enrollment: {
          select: {
            contactId: true,
            sequence: { select: { name: true, timeZone: true, plainText: true } },
            contact: { select: { email: true, company: true, title: true, province: true, city: true, tags: true } },
          },
        },
      },
    }),
    db.sender.findMany({ select: { email: true, name: true } }),
  ]);
  const contactIds = [...new Set(messages.map((m) => m.enrollment.contactId))];
  const replies = contactIds.length
    ? await db.reply.findMany({
        where: { contactId: { in: contactIds }, ...(since ? { receivedAt: { gte: since } } : {}) },
        select: { contactId: true, inReplyTo: true, receivedAt: true, label: true },
      })
    : [];
  const senderName = new Map(senders.map((s) => [s.email.toLowerCase(), s.name]));

  const envios = messages.map((m) => {
    const v = stepVariants(m.step).find((x) => x.label === m.variant) ?? stepVariants(m.step)[0];
    const c = m.enrollment.contact;
    return {
      id: m.id,
      contactId: m.enrollment.contactId,
      messageId: m.messageId,
      sentAt: m.sentAt,
      timeZone: m.enrollment.sequence.timeZone,
      step: m.step.order,
      // los envíos de antes de guardar el dato se reconocen por el «Re:» del asunto
      threaded: m.threaded ?? /^re:/i.test(m.subject),
      variant: m.variant,
      subjectTpl: v.subject,
      bodyTpl: v.body,
      sender: senderName.get(m.fromEmail.toLowerCase()) ?? (m.fromEmail || "Sin remitente"),
      sequence: m.enrollment.sequence.name,
      plainText: m.enrollment.sequence.plainText,
      opened: !!m.openedAt,
      province: c.province,
      city: c.city,
      // el Radar etiqueta cada contacto con «radar» y su rubro
      rubro: c.tags.find((t) => t !== "radar") ?? null,
      title: c.title,
      email: c.email ?? "",
      company: c.company ?? "",
    };
  });
  return atribuir(envios, replies);
}
