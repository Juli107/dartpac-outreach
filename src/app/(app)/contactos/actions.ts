"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseContactsCsv } from "@/lib/csv";
import { camposContacto, verificar, verificarLista } from "@/lib/verifier";

function parseTags(raw: FormDataEntryValue | null) {
  return String(raw ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

/** Alta a mano: con email (se verifica antes de guardar) o, si no hay, con teléfono / WhatsApp. */
export async function addContact(form: FormData) {
  const data = z
    .object({
      email: z.string().trim().toLowerCase().optional(),
      firstName: z.string().trim().optional(),
      lastName: z.string().trim().optional(),
      company: z.string().trim().optional(),
      title: z.string().trim().optional(),
      phone: z.string().trim().optional(),
    })
    .parse(Object.fromEntries(["email", "firstName", "lastName", "company", "title", "phone"].map((k) => [k, String(form.get(k) ?? "").trim() || undefined])));
  const tags = parseTags(form.get("tags"));
  if (!data.email && !data.phone) redirect(`/contactos?error=${encodeURIComponent("Cargá un email o un teléfono.")}`);
  let vfy = data.email ? await verificar(data.email) : null;
  if (vfy?.estado === "corregible" && vfy.sugerencia) {
    const original = data.email;
    data.email = vfy.sugerencia;
    vfy = await verificar(data.email);
    redirect(`/contactos?error=${encodeURIComponent(`Revisá el email: ¿quisiste decir ${data.email}? (escribiste ${original})`)}`);
  }
  if (vfy?.estado === "invalido") redirect(`/contactos?error=${encodeURIComponent(`Ese email no sirve: ${vfy.motivos[0]?.t ?? "revisalo"}.`)}`);
  const extra = vfy ? camposContacto(vfy) : {};
  if (data.email) {
    await db.contact.upsert({ where: { email: data.email }, create: { ...data, ...extra, tags }, update: { ...data, ...extra, tags } });
  } else {
    await db.contact.create({ data: { ...data, email: null, tags } });
  }
  revalidatePath("/contactos");
}

export async function deleteContact(id: string) {
  await db.contact.delete({ where: { id } });
  revalidatePath("/contactos");
}

/** Aplica la corrección propuesta por el verificador (por ejemplo gmial.com → gmail.com). */
export async function corregirEmail(id: string) {
  const c = await db.contact.findUnique({ where: { id } });
  if (!c?.emailSuggestion) return;
  const taken = await db.contact.findUnique({ where: { email: c.emailSuggestion }, select: { id: true } });
  if (taken) return;
  const r = await verificar(c.emailSuggestion);
  await db.contact.update({ where: { id }, data: { email: c.emailSuggestion, ...camposContacto(r) } });
  revalidatePath("/contactos");
}

/** Verifica los contactos sin verificar (o todos con ?todos), de a tandas, con el DNS de cada dominio. */
export async function verificarContactos(form: FormData) {
  const todos = form.get("todos") === "1";
  const rows = await db.contact.findMany({
    where: { email: { not: null }, ...(todos ? {} : { emailCheckedAt: null }) },
    select: { id: true, email: true },
    take: 800,
  });
  const res = await verificarLista(rows.map((r) => r.email!), { concurrency: 10 });
  for (const [i, r] of res.entries()) await db.contact.update({ where: { id: rows[i].id }, data: camposContacto(r) });
  revalidatePath("/", "layout");
  const volver = String(form.get("volver") ?? "");
  const destino = volver.startsWith("/verificador") ? volver : "/contactos";
  redirect(`${destino}${destino.includes("?") ? "&" : "?"}verificados=${rows.length}`);
}

/**
 * Importa un CSV. Cada email pasa por el verificador antes de cargarse: los tipeos evidentes se corrigen,
 * los inválidos no se cargan, y a los riesgosos se los marca.
 */
export async function importContacts(form: FormData) {
  const file = form.get("file");
  let text = String(form.get("text") ?? "");
  if (file instanceof File && file.size > 0) text = await file.text();
  const { contacts, skipped } = parseContactsCsv(text);
  const tags = parseTags(form.get("tags"));
  const checks = await verificarLista(contacts.map((c) => c.email), { concurrency: 10 });
  let created = 0, updated = 0, corregidos = 0, invalidos = 0;
  for (const [i, c0] of contacts.entries()) {
    let c = c0, r = checks[i];
    if (r.estado === "corregible" && r.sugerencia) {
      c = { ...c0, email: r.sugerencia };
      r = await verificar(c.email);
      corregidos++;
    }
    if (r.estado === "invalido" || r.estado === "vacio") {
      invalidos++;
      continue;
    }
    const extra = camposContacto(r);
    const existing = await db.contact.findUnique({ where: { email: c.email }, select: { tags: true } });
    if (existing) {
      await db.contact.update({ where: { email: c.email }, data: { ...c, ...extra, tags: [...new Set([...existing.tags, ...tags])] } });
      updated++;
    } else {
      await db.contact.create({ data: { ...c, ...extra, tags } });
      created++;
    }
  }
  revalidatePath("/contactos");
  redirect(`/contactos?importados=${created}&actualizados=${updated}&omitidos=${skipped}&corregidos=${corregidos}&invalidos=${invalidos}`);
}
