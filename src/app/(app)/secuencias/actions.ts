"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { nextSendTime, windowFromEnv } from "@/lib/schedule";

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

export async function setSequenceStatus(id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DRAFT") {
  await db.sequence.update({ where: { id }, data: { status } });
  revalidatePath(`/secuencias/${id}`);
  revalidatePath("/secuencias");
}

export async function updateSequence(id: string, form: FormData) {
  const data = z
    .object({
      name: z.string().trim().min(1),
      dailyLimit: z.coerce.number().int().min(1).max(2000),
      senderId: z.string().transform((v) => v || null),
    })
    .parse({ name: form.get("name"), dailyLimit: form.get("dailyLimit"), senderId: form.get("senderId") ?? "" });
  await db.sequence.update({ where: { id }, data });
  revalidatePath(`/secuencias/${id}`);
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
  revalidatePath(`/secuencias/${sequenceId}`);
}

export async function updateStep(stepId: string, form: FormData) {
  const step = await db.step.update({ where: { id: stepId }, data: readStep(form) });
  revalidatePath(`/secuencias/${step.sequenceId}`);
}

export async function deleteStep(stepId: string) {
  const step = await db.step.delete({ where: { id: stepId } });
  // Renumera los pasos siguientes para que no queden huecos.
  const rest = await db.step.findMany({ where: { sequenceId: step.sequenceId, order: { gt: step.order } }, orderBy: { order: "asc" } });
  for (const s of rest) await db.step.update({ where: { id: s.id }, data: { order: s.order - 1 } });
  revalidatePath(`/secuencias/${step.sequenceId}`);
}

/** Inscribe contactos: por etiqueta, o todos si la etiqueta está vacía. Omite bajas, rebotes y ya inscritos. */
export async function enrollContacts(sequenceId: string, form: FormData) {
  const tag = String(form.get("tag") ?? "").trim();
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
  const runAt = nextSendTime(new Date(), first.delayDays, windowFromEnv());
  await db.enrollment.createMany({
    data: contacts.map((c) => ({ sequenceId, contactId: c.id, nextStep: first.order, nextRunAt: runAt })),
    skipDuplicates: true,
  });
  revalidatePath(`/secuencias/${sequenceId}`);
}

export async function setEnrollmentStatus(id: string, status: "ACTIVE" | "PAUSED") {
  const e = await db.enrollment.update({
    where: { id },
    data: { status, ...(status === "ACTIVE" ? { nextRunAt: new Date() } : {}) },
  });
  revalidatePath(`/secuencias/${e.sequenceId}`);
}
