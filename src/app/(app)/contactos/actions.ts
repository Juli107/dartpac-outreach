"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseContactsCsv } from "@/lib/csv";

function parseTags(raw: FormDataEntryValue | null) {
  return String(raw ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

export async function addContact(form: FormData) {
  const data = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      firstName: z.string().trim().optional(),
      lastName: z.string().trim().optional(),
      company: z.string().trim().optional(),
      title: z.string().trim().optional(),
    })
    .parse(Object.fromEntries(["email", "firstName", "lastName", "company", "title"].map((k) => [k, form.get(k) ?? undefined])));
  const tags = parseTags(form.get("tags"));
  await db.contact.upsert({ where: { email: data.email }, create: { ...data, tags }, update: { ...data, tags } });
  revalidatePath("/contactos");
}

export async function deleteContact(id: string) {
  await db.contact.delete({ where: { id } });
  revalidatePath("/contactos");
}

export async function importContacts(form: FormData) {
  const file = form.get("file");
  let text = String(form.get("text") ?? "");
  if (file instanceof File && file.size > 0) text = await file.text();
  const { contacts, skipped } = parseContactsCsv(text);
  const tags = parseTags(form.get("tags"));
  let created = 0;
  let updated = 0;
  for (const c of contacts) {
    const existing = await db.contact.findUnique({ where: { email: c.email }, select: { tags: true } });
    if (existing) {
      await db.contact.update({ where: { email: c.email }, data: { ...c, tags: [...new Set([...existing.tags, ...tags])] } });
      updated++;
    } else {
      await db.contact.create({ data: { ...c, tags } });
      created++;
    }
  }
  revalidatePath("/contactos");
  redirect(`/contactos?importados=${created}&actualizados=${updated}&omitidos=${skipped}`);
}
