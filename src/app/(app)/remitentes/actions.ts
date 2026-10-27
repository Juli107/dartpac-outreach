"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { revokeToken } from "@/lib/google";
import { mailboxFor, verifyMailbox } from "@/lib/mailer";
import { imageSize } from "@/lib/image-size";

const senderSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  signature: z.string().max(3000).default(""),
  jobTitle: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(40).default(""),
  whatsapp: z.string().trim().max(40).default(""),
  waPhoneNumberId: z.string().trim().max(40).regex(/^\d*$/, "El ID del número son solo dígitos").default(""),
  waDailyLimit: z.coerce.number().int().min(1).max(1000).default(20),
  website: z.string().trim().max(200).default(""),
  // «IMAGEN»: solo la imagen. «DATOS»: la imagen con nombre, cargo y empresa al lado (ver lib/signature).
  signatureImageMode: z.enum(["IMAGEN", "DATOS"]).catch("IMAGEN"),
  dailyLimit: z.coerce.number().int().min(1).max(500),
  // Las contraseñas de aplicación de Google se muestran con espacios; se guardan sin ellos.
  appPassword: z.string().transform((v) => v.replace(/\s+/g, "")),
});

function read(form: FormData) {
  return senderSchema.parse({
    name: form.get("name"),
    email: form.get("email"),
    signature: form.get("signature") ?? "",
    jobTitle: form.get("jobTitle") ?? "",
    phone: form.get("phone") ?? "",
    whatsapp: form.get("whatsapp") ?? "",
    waPhoneNumberId: form.get("waPhoneNumberId") ?? "",
    waDailyLimit: form.get("waDailyLimit") ?? 20,
    website: form.get("website") ?? "",
    signatureImageMode: form.get("signatureImageMode") ?? "IMAGEN",
    dailyLimit: form.get("dailyLimit") ?? 50,
    appPassword: form.get("appPassword") ?? "",
  });
}

const MAX_IMAGE_BYTES = 300 * 1024;

/** Lee la imagen subida (PNG, JPG o GIF, hasta 300 KB). Sin archivo devuelve null. */
async function readImage(form: FormData) {
  const file = form.get("signatureImage");
  if (!(file instanceof File) || file.size === 0) return null;
  const fail = (msg: string) => redirect(`/remitentes?error=${encodeURIComponent(msg)}`);
  if (file.size > MAX_IMAGE_BYTES) fail("La imagen pesa más de 300 KB: expórtala más liviana.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = imageSize(bytes);
  if (!size) return fail("Formato no válido: usa PNG, JPG o GIF.");
  return {
    signatureImage: bytes,
    signatureImageType: size.type,
    signatureImageWidth: size.width,
    signatureImageHeight: size.height,
    signatureImageVersion: { increment: 1 },
  };
}

export async function createSender(form: FormData) {
  const { appPassword, ...data } = read(form);
  const image = await readImage(form);
  await db.sender.create({
    data: { ...data, ...(image ? { ...image, signatureImageVersion: 1 } : {}), appPassword: appPassword ? encryptSecret(appPassword) : null },
  });
  revalidatePath("/remitentes");
}

/** Deja la contraseña y la imagen como están si sus campos llegan vacíos. */
export async function updateSender(id: string, form: FormData) {
  const { appPassword, ...data } = read(form);
  const image = await readImage(form);
  await db.sender.update({
    where: { id },
    data: { ...data, ...(image ?? {}), ...(appPassword ? { appPassword: encryptSecret(appPassword) } : {}) },
  });
  revalidatePath("/remitentes");
}

export async function removeSignatureImage(id: string) {
  await db.sender.update({
    where: { id },
    data: { signatureImage: null, signatureImageType: null, signatureImageWidth: null, signatureImageHeight: null },
  });
  revalidatePath("/remitentes");
}

export async function disconnectSender(id: string) {
  await db.sender.update({ where: { id }, data: { appPassword: null } });
  revalidatePath("/remitentes");
}

/** Quita la conexión con Google y retira el permiso en la cuenta del comercial. */
export async function disconnectGoogle(id: string) {
  const sender = await db.sender.findUniqueOrThrow({ where: { id }, select: { googleRefreshToken: true } });
  await db.sender.update({ where: { id }, data: { googleRefreshToken: null, googleConnectedAt: null } });
  if (sender.googleRefreshToken) await revokeToken(decryptSecret(sender.googleRefreshToken));
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
  await db.sender.update({ where: { id }, data: { lastCheckAt: new Date(), lastCheckError: result === "ok" ? null : result } });
  redirect(`/remitentes?prueba=${id}&resultado=${encodeURIComponent(result)}`);
}
