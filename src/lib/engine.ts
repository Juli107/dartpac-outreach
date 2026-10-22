import { db } from "./db";
import { sendEmail, newMessageId, mailboxFor } from "./mailer";
import { renderTemplate } from "./template";
import { renderSignature } from "./signature";
import { sendingEnabled } from "./settings";
import { nextSendTime, isInWindow, windowFromEnv } from "./schedule";
import { randomUUID } from "node:crypto";
import { sentToday as countSentToday, generalMailbox, minGapMinutes } from "./quota";

const BATCH = 50;

/**
 * Procesa los pasos que tocan ahora: envía emails o crea tareas manuales
 * y programa el siguiente paso de cada contacto. Lo llama /api/cron cada 10 minutos.
 */
export async function runDueSteps(now = new Date()) {
  const window = windowFromEnv();
  const company = process.env.COMPANY_NAME ?? "Plupack Embalajes";
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const summary = { sent: 0, tasks: 0, finished: 0, errors: 0, skippedOutsideWindow: false, sendingOff: false };
  // Nada sale hasta que alguien encienda los envíos desde el panel.
  if (!(await sendingEnabled())) {
    summary.sendingOff = true;
    return summary;
  }
  if (!isInWindow(now, window)) {
    summary.skippedOutsideWindow = true;
    return summary;
  }

  // Dos cupos diarios: el de la secuencia y el del buzón (que comparten todas sus secuencias).
  const { bySequence, byMailbox, lastByMailbox } = await countSentToday(now);
  const general = generalMailbox();
  const mailboxOf = (sq: { sender: { email: string; dailyLimit: number } | null }) => ({
    box: sq.sender?.email.toLowerCase() ?? general.email,
    limit: sq.sender?.dailyLimit ?? general.dailyLimit,
  });
  // Ritmo humano: cada buzón espera su intervalo desde el último envío y manda uno por pasada.
  const paced = (box: string, limit: number) => {
    const last = lastByMailbox.get(box);
    // Margen del 25 %: los avisos del cron llegan con algo de retraso y no deben perder turnos.
    return !last || now.getTime() - last.getTime() >= minGapMinutes(limit, window.startHour, window.endHour) * 0.75 * 60_000;
  };
  // Las secuencias que ya llenaron su cupo (o el de su buzón) se saltan para no ocupar el lote.
  const active = await db.sequence.findMany({ where: { status: "ACTIVE" }, select: { id: true, dailyLimit: true, sender: true } });
  const full = active
    .filter((sq) => {
      const { box, limit } = mailboxOf(sq);
      return (bySequence.get(sq.id) ?? 0) >= sq.dailyLimit || (byMailbox.get(box) ?? 0) >= limit || !paced(box, limit);
    })
    .map((sq) => sq.id);

  const due = await db.enrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now }, sequence: { status: "ACTIVE" }, sequenceId: { notIn: full } },
    include: { contact: true, sequence: { include: { sender: true, steps: { orderBy: { order: "asc" } } } } },
    orderBy: { nextRunAt: "asc" },
    take: BATCH,
  });

  for (const enr of due) {
    const { contact, sequence } = enr;
    if (contact.unsubscribed || contact.bounced) {
      await db.enrollment.update({
        where: { id: enr.id },
        data: { status: contact.unsubscribed ? "UNSUBSCRIBED" : "BOUNCED", nextRunAt: null },
      });
      continue;
    }

    const step = sequence.steps.find((s) => s.order === enr.nextStep);
    if (!step) {
      await db.enrollment.update({ where: { id: enr.id }, data: { status: "FINISHED", nextRunAt: null } });
      summary.finished++;
      continue;
    }

    if (step.type === "EMAIL") {
      const { box, limit } = mailboxOf(sequence);
      if ((bySequence.get(sequence.id) ?? 0) >= sequence.dailyLimit) continue;
      if ((byMailbox.get(box) ?? 0) >= limit || !paced(box, limit)) continue;

      const previous = step.sameThread
        ? await db.message.findFirst({ where: { enrollmentId: enr.id, error: null }, orderBy: { sentAt: "desc" } })
        : null;
      const subject = previous ? `Re: ${previous.subject.replace(/^Re:\s*/i, "")}` : renderTemplate(step.subject, contact);
      const trackingId = randomUUID();
      let messageId = `<${trackingId}@sin-enviar>`;
      let error: string | null = null;
      try {
        const mailbox = mailboxFor(sequence.sender);
        messageId = newMessageId(mailbox.user);
        await sendEmail({
          mailbox,
          to: contact.email,
          subject,
          body: renderTemplate(step.body, contact),
          signature: sequence.sender
            ? renderSignature(sequence.sender, company, baseUrl, renderTemplate(sequence.sender.signature, contact))
            : undefined,
          messageId,
          trackingId,
          contactId: contact.id,
          inReplyTo: previous?.messageId,
        });
        summary.sent++;
        bySequence.set(sequence.id, (bySequence.get(sequence.id) ?? 0) + 1);
        byMailbox.set(box, (byMailbox.get(box) ?? 0) + 1);
        lastByMailbox.set(box, now);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        summary.errors++;
      }
      await db.message.create({
        data: { id: trackingId, enrollmentId: enr.id, stepId: step.id, messageId, subject, error, fromEmail: box },
      });
      if (error) {
        // Reintenta en una hora sin avanzar de paso.
        await db.enrollment.update({ where: { id: enr.id }, data: { nextRunAt: new Date(now.getTime() + 3600_000) } });
        continue;
      }
    } else {
      await db.task.create({
        data: { enrollmentId: enr.id, title: renderTemplate(step.subject || "Tarea manual", contact), notes: renderTemplate(step.body, contact) },
      });
      summary.tasks++;
    }

    const following = sequence.steps.find((s) => s.order === step.order + 1);
    await db.enrollment.update({
      where: { id: enr.id },
      data: following
        ? { nextStep: following.order, nextRunAt: nextSendTime(now, following.delayDays, window) }
        : { nextStep: step.order + 1, status: "FINISHED", nextRunAt: null },
    });
    if (!following) summary.finished++;
  }
  return summary;
}
