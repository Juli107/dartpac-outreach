import { db } from "./db";
import { sendEmail, newMessageId, mailboxFor } from "./mailer";
import { renderTemplate } from "./template";
import { renderSignature, sinFirmaRepetida } from "./signature";
import { nextSendTime, isInWindow, windowFor } from "./schedule";
import { pickVariant, stepVariants } from "./variants";
import { randomUUID } from "node:crypto";
import { isHardBounce } from "./bounce";
import { sentToday as countSentToday, minGapMinutes, todayStart } from "./quota";
import { sePuedeEnviar } from "./verifier";
import { contactWa } from "./whatsapp";
import { eventoRadar } from "./radar/outreach";
import { cargarVariables } from "./variables";
import { sendWaTemplate, waApiReady, waParamList } from "./whatsapp-api";
import { registrar } from "./actividad";

const quienEs = (c: { company: string | null; firstName: string | null; lastName: string | null; email: string | null; phone: string | null }) =>
  c.company || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.phone || "un contacto";

const BATCH = 50;


/**
 * Procesa los pasos que tocan ahora: envía emails o crea tareas manuales
 * y programa el siguiente paso de cada contacto. Lo llama /api/cron cada 10 minutos.
 * Solo trabajan las secuencias encendidas y dentro de su propio horario.
 */
export async function runDueSteps(now = new Date()) {
  const company = process.env.COMPANY_NAME ?? "Plupack Embalajes";
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const summary = { sent: 0, wa: 0, tasks: 0, finished: 0, errors: 0, sequencesOn: 0, outsideWindow: 0, skipped: 0 };
  // Variables del equipo ({{catalogo}}, «si falta», saludo): se leen una vez por pasada.
  const vars = await cargarVariables();
  const on = await db.sequence.findMany({
    where: { sendingOn: true, status: "ACTIVE" },
    select: { id: true, dailyLimit: true, sender: true, timeZone: true, startHour: true, endHour: true, sendDays: true },
  });
  summary.sequencesOn = on.length;
  // Sin remitente no hay desde dónde enviar.
  const active = on.filter((sq) => sq.sender && isInWindow(now, windowFor(sq)));
  summary.outsideWindow = on.length - active.length;
  if (active.length === 0) return summary;

  // Dos cupos diarios: el de la secuencia y el del buzón (que comparten todas sus secuencias).
  const { bySequence, byMailbox, lastByMailbox } = await countSentToday(now);
  const mailboxOf = (sq: { sender: { email: string; dailyLimit: number } | null }) => ({
    box: sq.sender?.email.toLowerCase() ?? "",
    limit: sq.sender?.dailyLimit ?? 0,
  });
  // Ritmo humano: cada buzón espera su intervalo desde el último envío y manda uno por pasada.
  const paced = (box: string, limit: number, sq: { startHour: number; endHour: number }) => {
    const last = lastByMailbox.get(box);
    // Margen del 25 %: los avisos del cron llegan con algo de retraso y no deben perder turnos.
    return !last || now.getTime() - last.getTime() >= minGapMinutes(limit, sq.startHour, sq.endHour) * 0.75 * 60_000;
  };
  // Las secuencias que ya llenaron su cupo (o el de su buzón) se saltan para no ocupar el lote.
  const ready = active
    .filter((sq) => {
      const { box, limit } = mailboxOf(sq);
      return (bySequence.get(sq.id) ?? 0) < sq.dailyLimit && (byMailbox.get(box) ?? 0) < limit && paced(box, limit, sq);
    })
    .map((sq) => sq.id);

  // WhatsApp automáticos de hoy, por remitente (cada número tiene su propio tope).
  const waBySender = new Map<string, number>();
  for (const r of await db.waMessage.groupBy({ by: ["senderId"], where: { sentAt: { gte: todayStart(now) }, error: null }, _count: true })) {
    if (r.senderId) waBySender.set(r.senderId, r._count);
  }
  // los WhatsApp que quedan como tarea para mandar a mano también cuentan para el tope diario del remitente
  for (const t of await db.task.findMany({ where: { kind: "WHATSAPP", createdAt: { gte: todayStart(now) } }, select: { enrollment: { select: { sequence: { select: { senderId: true } } } } } })) {
    const sid = t.enrollment.sequence.senderId;
    if (sid) waBySender.set(sid, (waBySender.get(sid) ?? 0) + 1);
  }
  const waLleno = (s: { id: string; waDailyLimit: number } | null) => !!s && (waBySender.get(s.id) ?? 0) >= s.waDailyLimit;

  const due = await db.enrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now }, sequenceId: { in: ready } },
    include: {
      contact: true,
      sequence: { include: { sender: true, steps: { orderBy: { order: "asc" }, include: { variants: true } } } },
    },
    orderBy: { nextRunAt: "asc" },
    take: BATCH,
  });

  for (const enr of due) {
    const { contact, sequence } = enr;
    const window = windowFor(sequence);
    if (contact.unsubscribed || contact.bounced) {
      await db.enrollment.update({
        where: { id: enr.id },
        data: { status: contact.unsubscribed ? "UNSUBSCRIBED" : "BOUNCED", nextRunAt: null },
      });
      continue;
    }

    const step = sequence.steps.find((s) => s.order === enr.nextStep);
    if (!step) {
      await db.enrollment.update({ where: { id: enr.id }, data: { status: "FINISHED", nextRunAt: null, finishedAt: now } });
      summary.finished++;
      continue;
    }

    const ctx = { sender: sequence.sender, now, timeZone: sequence.timeZone, vars };
    // Cambio de canal: si el contacto no tiene email válido, el paso de email sale por WhatsApp, y al revés.
    // Si no tiene ninguno de los dos, el paso se saltea y sigue el próximo.
    const mailOk = sePuedeEnviar(contact), waOk = !!contactWa(contact);
    const cambio = (step.type === "EMAIL" && !mailOk && waOk) || (step.type === "WHATSAPP" && !waOk && mailOk);
    const tipo = cambio ? (step.type === "EMAIL" ? "WHATSAPP" : "EMAIL") : step.type;
    const skip = (tipo === "EMAIL" && !mailOk) || (tipo === "WHATSAPP" && !waOk);

    if (skip) {
      summary.skipped++;
    } else if (tipo === "EMAIL") {
      const { box, limit } = mailboxOf(sequence);
      if ((bySequence.get(sequence.id) ?? 0) >= sequence.dailyLimit) continue;
      if ((byMailbox.get(box) ?? 0) >= limit || !paced(box, limit, sequence)) continue;

      const variant = pickVariant(`${enr.id}:${step.id}`, stepVariants(step));
      const previous = step.sameThread
        ? await db.message.findFirst({ where: { enrollmentId: enr.id, error: null }, orderBy: { sentAt: "desc" } })
        : null;
      // un paso de WhatsApp que sale por email no tiene asunto propio: sigue el hilo anterior o usa uno sencillo
      const asunto = cambio ? `{{mi_empresa}} · {{empresa}}` : variant.subject;
      const subject = previous ? `Re: ${previous.subject.replace(/^Re:\s*/i, "")}` : renderTemplate(asunto, contact, ctx);
      const trackingId = randomUUID();
      let messageId = `<${trackingId}@sin-enviar>`;
      let error: string | null = null;
      try {
        const mailbox = mailboxFor(sequence.sender);
        messageId = newMessageId(mailbox.user);
        await sendEmail({
          mailbox,
          to: contact.email!,
          subject,
          // si el texto termina con la firma (nombre, empresa, teléfono…), no se repite: la firma del remitente va abajo
          body: sequence.sender
            ? sinFirmaRepetida(renderTemplate(variant.body, contact, ctx), sequence.sender, [company, renderTemplate("{{mi_empresa}}", contact, ctx)])
            : renderTemplate(variant.body, contact, ctx),
          plainText: sequence.plainText,
          signature: sequence.sender
            ? renderSignature(sequence.sender, company, baseUrl, renderTemplate(sequence.sender.signature, contact, ctx))
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
        data: { id: trackingId, enrollmentId: enr.id, stepId: step.id, messageId, subject, error, fromEmail: box, variant: variant.label, threaded: !!previous },
      });
      if (error && isHardBounce(error)) {
        // El servidor rechazó la dirección: no se reintenta y el contacto queda como rebotado.
        await db.contact.update({ where: { id: contact.id }, data: { bounced: true } });
        await db.enrollment.updateMany({ where: { contactId: contact.id, status: { in: ["ACTIVE", "PAUSED"] } }, data: { status: "BOUNCED", nextRunAt: null } });
        await eventoRadar(contact, { k: "rebote" });
        continue;
      }
      if (!error) {
        await eventoRadar(contact, { k: "mail", secuencia: sequence.name, paso: step.order, asunto: subject, por: sequence.sender?.name.split(/\s+/)[0] });
        await registrar(sequence.sender ? { name: sequence.sender.name, senderId: sequence.sender.id } : null, "mail", `«${sequence.name}» paso ${step.order} a ${quienEs(contact)}: ${subject}`, { contactId: contact.id, ref: `mail:${trackingId}` });
      }
      if (error) {
        // Reintenta en una hora sin avanzar de paso.
        await db.enrollment.update({ where: { id: enr.id }, data: { nextRunAt: new Date(now.getTime() + 3600_000) } });
        continue;
      }
    } else if (tipo === "WHATSAPP" && !cambio && step.waTemplate && waApiReady(sequence.sender)) {
      // WhatsApp automático: plantilla aprobada por Meta desde el número del remitente.
      const sender = sequence.sender!;
      if (waLleno(sender)) {
        await db.enrollment.update({ where: { id: enr.id }, data: { nextRunAt: nextSendTime(now, 1, window) } });
        continue;
      }
      const to = contactWa(contact);
      let wamid: string | null = null;
      let error: string | null = null;
      try {
        wamid = await sendWaTemplate({
          phoneNumberId: sender.waPhoneNumberId,
          to,
          template: step.waTemplate,
          lang: step.waLang,
          params: waParamList(step.waParams).map((p) => renderTemplate(p, contact, ctx)),
        });
        summary.wa++;
        waBySender.set(sender.id, (waBySender.get(sender.id) ?? 0) + 1);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        summary.errors++;
      }
      await db.waMessage.create({ data: { enrollmentId: enr.id, stepId: step.id, senderId: sender.id, to, template: step.waTemplate, wamid, error } });
      if (error) {
        // Reintenta en una hora; al tercer fallo queda como tarea para mandarlo a mano y sigue la secuencia.
        const fallos = await db.waMessage.count({ where: { enrollmentId: enr.id, stepId: step.id, error: { not: null } } });
        if (fallos < 3) {
          await db.enrollment.update({ where: { id: enr.id }, data: { nextRunAt: new Date(now.getTime() + 3600_000) } });
          continue;
        }
        await db.task.create({
          data: { enrollmentId: enr.id, kind: "WHATSAPP", title: `WhatsApp que no salió solo: ${contact.company || contact.firstName || to}`, notes: `${renderTemplate(step.body, contact, ctx)}\n\n(${error})` },
        });
        summary.tasks++;
      } else {
        await eventoRadar(contact, { k: "wa", secuencia: sequence.name, por: sender.name.split(/\s+/)[0] });
        await registrar({ name: sender.name, senderId: sender.id }, "whatsapp", `«${sequence.name}» paso ${step.order} a ${quienEs(contact)} por WhatsApp`, { contactId: contact.id, ref: `wa:${wamid}` });
      }
    } else if (tipo === "WHATSAPP") {
      // Sin plantilla aprobada o sin número conectado a la API (o un email que pasó a WhatsApp porque no tiene
      // email válido): queda como tarea con el mensaje listo para abrir. Con el tope de WhatsApp del día lleno, pasa a mañana.
      if (waLleno(sequence.sender)) {
        await db.enrollment.update({ where: { id: enr.id }, data: { nextRunAt: nextSendTime(now, 1, window) } });
        continue;
      }
      const who = contact.company || [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone || "contacto";
      const variant = cambio ? pickVariant(`${enr.id}:${step.id}`, stepVariants(step)) : null;
      await db.task.create({
        data: {
          enrollmentId: enr.id,
          kind: "WHATSAPP",
          title: cambio ? `WhatsApp a ${who} (no tiene email: va el texto del email)` : renderTemplate(step.subject || `WhatsApp a ${who}`, contact, ctx),
          notes: renderTemplate(variant ? variant.body : step.body, contact, ctx),
        },
      });
      summary.tasks++;
      if (sequence.sender) waBySender.set(sequence.sender.id, (waBySender.get(sequence.sender.id) ?? 0) + 1);
    } else {
      await db.task.create({
        data: { enrollmentId: enr.id, kind: "TASK", title: renderTemplate(step.subject || "Tarea manual", contact, ctx), notes: renderTemplate(step.body, contact, ctx) },
      });
      summary.tasks++;
    }

    const following = sequence.steps.find((s) => s.order === step.order + 1);
    await db.enrollment.update({
      where: { id: enr.id },
      data: following
        ? { nextStep: following.order, nextRunAt: nextSendTime(now, following.delayDays, window) }
        : { nextStep: step.order + 1, status: "FINISHED", nextRunAt: null, finishedAt: now },
    });
    if (!following) {
      summary.finished++;
      await eventoRadar(contact, { k: "fin", motivo: "completa" });
    }
  }
  return summary;
}
