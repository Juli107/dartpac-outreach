import { db } from "./db";
import { sendEmail, newMessageId } from "./mailer";
import { renderTemplate } from "./template";
import { withSignature } from "./signature";
import { nextSendTime, isInWindow, windowFromEnv } from "./schedule";
import { randomUUID } from "node:crypto";

const BATCH = 50;

/**
 * Procesa los pasos que tocan ahora: envía emails o crea tareas manuales
 * y programa el siguiente paso de cada contacto. Lo llama /api/cron cada 10 minutos.
 */
export async function runDueSteps(now = new Date()) {
  const window = windowFromEnv();
  const summary = { sent: 0, tasks: 0, finished: 0, errors: 0, skippedOutsideWindow: false };
  if (!isInWindow(now, window)) {
    summary.skippedOutsideWindow = true;
    return summary;
  }

  const due = await db.enrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now }, sequence: { status: "ACTIVE" } },
    include: { contact: true, sequence: { include: { steps: { orderBy: { order: "asc" } } } } },
    orderBy: { nextRunAt: "asc" },
    take: BATCH,
  });

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = new Map<string, number>();

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
      if (!sentToday.has(sequence.id)) {
        sentToday.set(
          sequence.id,
          await db.message.count({ where: { sentAt: { gte: startOfDay }, enrollment: { sequenceId: sequence.id } } }),
        );
      }
      if (sentToday.get(sequence.id)! >= sequence.dailyLimit) continue;

      const previous = step.sameThread
        ? await db.message.findFirst({ where: { enrollmentId: enr.id, error: null }, orderBy: { sentAt: "desc" } })
        : null;
      const subject = previous ? `Re: ${previous.subject.replace(/^Re:\s*/i, "")}` : renderTemplate(step.subject, contact);
      const messageId = newMessageId();
      const trackingId = randomUUID();
      let error: string | null = null;
      try {
        await sendEmail({
          to: contact.email,
          subject,
          body: withSignature(renderTemplate(step.body, contact), renderTemplate(sequence.signature, contact)),
          messageId,
          trackingId,
          contactId: contact.id,
          inReplyTo: previous?.messageId,
        });
        summary.sent++;
        sentToday.set(sequence.id, sentToday.get(sequence.id)! + 1);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        summary.errors++;
      }
      await db.message.create({
        data: { id: trackingId, enrollmentId: enr.id, stepId: step.id, messageId, subject, error },
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
