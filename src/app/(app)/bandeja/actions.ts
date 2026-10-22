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
  await syncInbox();
  revalidatePath("/", "layout");
}
