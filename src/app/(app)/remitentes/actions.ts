"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { mailboxFor, verifyMailbox } from "@/lib/mailer";

const senderSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  signature: z.string().max(3000).default(""),
  // Las contraseñas de aplicación de Google se muestran con espacios; se guardan sin ellos.
  appPassword: z.string().transform((v) => v.replace(/\s+/g, "")),
});

function read(form: FormData) {
  return senderSchema.parse({
    name: form.get("name"),
    email: form.get("email"),
    signature: form.get("signature") ?? "",
    appPassword: form.get("appPassword") ?? "",
  });
}

export async function createSender(form: FormData) {
  const { appPassword, ...data } = read(form);
  await db.sender.create({ data: { ...data, appPassword: appPassword ? encryptSecret(appPassword) : null } });
  revalidatePath("/remitentes");
}

/** Deja la contraseña como está si el campo llega vacío. */
export async function updateSender(id: string, form: FormData) {
  const { appPassword, ...data } = read(form);
  await db.sender.update({ where: { id }, data: { ...data, ...(appPassword ? { appPassword: encryptSecret(appPassword) } : {}) } });
  revalidatePath("/remitentes");
}

export async function disconnectSender(id: string) {
  await db.sender.update({ where: { id }, data: { appPassword: null } });
  revalidatePath("/remitentes");
}

export async function deleteSender(id: string) {
  await db.sender.delete({ where: { id } });
  revalidatePath("/remitentes");
}

export async function testSender(id: string) {
  const sender = await db.sender.findUniqueOrThrow({ where: { id } });
  let result: string;
  try {
    await verifyMailbox(mailboxFor(sender));
    result = "ok";
  } catch (e) {
    result = e instanceof Error ? e.message : String(e);
  }
  redirect(`/remitentes?prueba=${id}&resultado=${encodeURIComponent(result)}`);
}
