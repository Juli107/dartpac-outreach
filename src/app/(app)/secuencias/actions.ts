"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { nextSendTime, windowFor } from "@/lib/schedule";
import { nextVariantLabel } from "@/lib/variants";

export async function createSequence(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const seq = await db.sequence.create({
    data: {
      name,
      steps: {
        create: {
          order: 1,
          delayDays: 0,
          subject: "{{empresa}} y Plupack Embalajes",
          body: "Hola {{nombre|}},\n\nEscribe aquí tu primer mensaje.",
        },
      },
    },
  });
  redirect(`/secuencias/${seq.id}`);
}

function refresh(id: string) {
  revalidatePath(`/secuencias/${id}`);
  revalidatePath("/secuencias");
  revalidatePath("/");
}

export async function setSequenceStatus(id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DRAFT") {
  // Archivar o pausar también apaga el interruptor: nunca queda enviando algo que no se ve.
  await db.sequence.update({ where: { id }, data: { status, ...(status === "ACTIVE" ? {} : { sendingOn: false }) } });
  refresh(id);
}

/** Interruptor de la secuencia: encendida envía sola dentro de su horario; apagada no envía nada. */
export async function toggleSequence(id: string, on: boolean) {
  if (on) {
    const steps = await db.step.count({ where: { sequenceId: id } });
    if (steps === 0) return;
  }
  await db.sequence.update({ where: { id }, data: { sendingOn: on, status: on ? "ACTIVE" : "PAUSED" } });
  refresh(id);
}

const settingsSchema = z.object({
  name: z.string().trim().min(1),
  dailyLimit: z.coerce.number().int().min(1).max(500),
  senderId: z.string().transform((v) => v || null),
  timeZone: z.string().min(1),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(24),
  sendDays: z.array(z.coerce.number().int().min(0).max(6)).min(1),
});

export async function updateSequence(id: string, form: FormData) {
  const parsed = settingsSchema.safeParse({
    name: form.get("name"),
    dailyLimit: form.get("dailyLimit"),
    senderId: form.get("senderId") ?? "",
    timeZone: form.get("timeZone"),
    startHour: form.get("startHour"),
    endHour: form.get("endHour"),
    sendDays: form.getAll("sendDays"),
  });
  if (!parsed.success || parsed.data.endHour <= parsed.data.startHour) {
    redirect(`/secuencias/${id}?tab=ajustes&error=${encodeURIComponent("Revisa el horario: la hora de fin debe ser posterior a la de inicio y hace falta al menos un día.")}`);
  }
  await db.sequence.update({ where: { id }, data: parsed.data });
  refresh(id);
  redirect(`/secuencias/${id}?tab=ajustes&guardado=1`);
}

export async function setPlainText(id: string, on: boolean) {
  await db.sequence.update({ where: { id }, data: { plainText: on } });
  refresh(id);
}

const stepSchema = z.object({
  type: z.enum(["EMAIL", "TASK"]),
  delayDays: z.coerce.number().int().min(0).max(90),
  subject: z.string().default(""),
  body: z.string().default(""),
  sameThread: z.preprocess((v) => v === "on", z.boolean()),
});

function readStep(form: FormData) {
  return stepSchema.parse({
    type: form.get("type"),
    delayDays: form.get("delayDays"),
    subject: form.get("subject") ?? "",
    body: form.get("body") ?? "",
    sameThread: form.get("sameThread"),
  });
}

export async function addStep(sequenceId: string, form: FormData) {
  const last = await db.step.findFirst({ where: { sequenceId }, orderBy: { order: "desc" } });
  await db.step.create({ data: { sequenceId, order: (last?.order ?? 0) + 1, ...readStep(form) } });
  refresh(sequenceId);
}

/** Tipo, espera e hilo del paso. */
export async function updateStepSettings(stepId: string, form: FormData) {
  const data = z
    .object({
      type: z.enum(["EMAIL", "TASK"]),
      delayDays: z.coerce.number().int().min(0).max(90),
      sameThread: z.preprocess((v) => v === "on", z.boolean()),
    })
    .parse({ type: form.get("type"), delayDays: form.get("delayDays"), sameThread: form.get("sameThread") });
  const step = await db.step.update({ where: { id: stepId }, data });
  refresh(step.sequenceId);
}

const contentSchema = z.object({ subject: z.string().default(""), body: z.string().default("") });

/** Texto de la variante A (el propio paso). */
export async function updateStepContent(stepId: string, form: FormData) {
  const data = contentSchema.parse({ subject: form.get("subject") ?? "", body: form.get("body") ?? "" });
  const step = await db.step.update({ where: { id: stepId }, data });
  refresh(step.sequenceId);
}

/** Nueva variante (B, C…) que parte del texto de la A para editarla. */
export async function addVariant(stepId: string) {
  const step = await db.step.findUniqueOrThrow({ where: { id: stepId }, include: { variants: { select: { label: true } } } });
  const label = nextVariantLabel(step.variants.map((v) => v.label));
  if (!label) return;
  await db.stepVariant.create({ data: { stepId, label, subject: step.subject, body: step.body } });
  refresh(step.sequenceId);
  redirect(`/secuencias/${step.sequenceId}?tab=pasos&paso=${stepId}&variante=${label}`);
}

export async function updateVariant(id: string, form: FormData) {
  const data = contentSchema.parse({ subject: form.get("subject") ?? "", body: form.get("body") ?? "" });
  const v = await db.stepVariant.update({ where: { id }, data, include: { step: { select: { sequenceId: true } } } });
  refresh(v.step.sequenceId);
}

export async function deleteVariant(id: string) {
  const v = await db.stepVariant.delete({ where: { id }, include: { step: { select: { sequenceId: true } } } });
  refresh(v.step.sequenceId);
  redirect(`/secuencias/${v.step.sequenceId}?tab=pasos&paso=${v.stepId}`);
}

export async function deleteStep(stepId: string) {
  const step = await db.step.delete({ where: { id: stepId } });
  // Renumera los pasos siguientes para que no queden huecos.
  const rest = await db.step.findMany({ where: { sequenceId: step.sequenceId, order: { gt: step.order } }, orderBy: { order: "asc" } });
  for (const s of rest) await db.step.update({ where: { id: s.id }, data: { order: s.order - 1 } });
  refresh(step.sequenceId);
}

/** Inscribe contactos: por etiqueta, o todos si la etiqueta está vacía. Omite bajas, rebotes y ya inscritos. */
export async function enrollContacts(sequenceId: string, form: FormData) {
  const tag = String(form.get("tag") ?? "").trim();
  const sequence = await db.sequence.findUniqueOrThrow({ where: { id: sequenceId } });
  const first = await db.step.findFirst({ where: { sequenceId }, orderBy: { order: "asc" } });
  if (!first) return;
  const contacts = await db.contact.findMany({
    where: {
      unsubscribed: false,
      bounced: false,
      ...(tag ? { tags: { has: tag } } : {}),
      enrollments: { none: { sequenceId } },
    },
    select: { id: true },
  });
  const runAt = nextSendTime(new Date(), first.delayDays, windowFor(sequence));
  await db.enrollment.createMany({
    data: contacts.map((c) => ({ sequenceId, contactId: c.id, nextStep: first.order, nextRunAt: runAt })),
    skipDuplicates: true,
  });
  refresh(sequenceId);
}

export async function setEnrollmentStatus(id: string, status: "ACTIVE" | "PAUSED") {
  const e = await db.enrollment.update({
    where: { id },
    data: { status, ...(status === "ACTIVE" ? { nextRunAt: new Date() } : {}) },
  });
  refresh(e.sequenceId);
}

/** Saca al contacto de la secuencia (su historial de envíos se borra con la inscripción). */
export async function removeEnrollment(id: string) {
  const e = await db.enrollment.delete({ where: { id } });
  refresh(e.sequenceId);
}
