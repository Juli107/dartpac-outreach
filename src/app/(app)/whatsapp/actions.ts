"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendWaText } from "@/lib/whatsapp-api";

export async function guardarBot(form: FormData) {
  const botInfo = String(form.get("botInfo") ?? "").slice(0, 20000);
  const botSaludo = String(form.get("botSaludo") ?? "").slice(0, 1000);
  await db.setting.upsert({ where: { id: "app" }, update: { botInfo, botSaludo }, create: { id: "app", botInfo, botSaludo } });
  revalidatePath("/whatsapp");
}

/** Una persona contesta desde Dartpac: sale por el mismo número y el bot se calla 12 h en ese chat. */
export async function responderWa(waId: string, form: FormData) {
  const text = String(form.get("texto") ?? "").trim();
  if (!text || !process.env.WHATSAPP_TOKEN) return;
  const ultimo = await db.waChat.findFirst({ where: { waId, direction: "in" }, orderBy: { at: "desc" } });
  if (!ultimo) return;
  try {
    const wamid = await sendWaText({ phoneNumberId: ultimo.phoneNumberId, to: waId, text });
    await db.waChat.create({ data: { waId, phoneNumberId: ultimo.phoneNumberId, direction: "out", by: "persona", body: text, wamid, contactId: ultimo.contactId } });
  } catch (e) {
    await db.waChat.create({ data: { waId, phoneNumberId: ultimo.phoneNumberId, direction: "out", by: "persona", body: text, contactId: ultimo.contactId, error: String(e instanceof Error ? e.message : e).slice(0, 500) } });
  }
  revalidatePath("/whatsapp");
}
