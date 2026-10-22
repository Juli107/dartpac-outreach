"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { syncInbox } from "@/lib/inbox";

const LABELS = ["NEW", "INTERESTED", "MEETING", "LATER", "NOT_INTERESTED"] as const;

export async function labelReply(id: string, form: FormData) {
  const label = String(form.get("label"));
  if (!LABELS.includes(label as (typeof LABELS)[number])) return;
  await db.reply.update({ where: { id }, data: { label: label as (typeof LABELS)[number], read: true } });
  revalidatePath("/bandeja");
}

export async function markRead(id: string) {
  await db.reply.update({ where: { id }, data: { read: true } });
  revalidatePath("/", "layout");
}

export async function checkInbox() {
  await syncInbox(14);
  revalidatePath("/", "layout");
}

/**
 * Lectura automática mientras la Bandeja está abierta: como mucho una vez por minuto
 * aunque haya varias pestañas abiertas (la marca se guarda en la base de datos).
 */
export async function autoCheckInbox() {
  const cutoff = new Date(Date.now() - 55_000);
  const claimed = await db.setting.updateMany({
    where: { id: "app", OR: [{ lastInboxAt: null }, { lastInboxAt: { lt: cutoff } }] },
    data: { lastInboxAt: new Date() },
  });
  if (claimed.count === 0) {
    const exists = await db.setting.findUnique({ where: { id: "app" } });
    if (exists) return { checked: false };
    await db.setting.create({ data: { id: "app", lastInboxAt: new Date() } });
  }
  const result = await syncInbox(14).catch((e) => ({ imported: 0, error: String(e) }));
  revalidatePath("/", "layout");
  return { checked: true, imported: result.imported };
}
