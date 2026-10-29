"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseContactsCsv } from "@/lib/csv";
import { camposContacto, verificar, verificarLista } from "@/lib/verifier";
import { usuarioActual } from "@/lib/usuario";
import { registrar } from "@/lib/actividad";

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
  // lo que carga un vendedor queda como cliente suyo; lo que carga el administrador queda libre para repartir
  const u = await usuarioActual();
  const dueno = !u.admin && u.senderId ? { ownerId: u.senderId, ownerAt: new Date() } : {};
  const nombre = data.company || [data.firstName, data.lastName].filter(Boolean).join(" ") || data.email || data.phone || "un contacto";
  const existe = data.email
    ? await db.contact.findUnique({ where: { email: data.email }, select: { id: true, ownerId: true, owner: { select: { name: true } } } })
    : null;
  if (existe?.ownerId && existe.owner && !u.admin && existe.ownerId !== u.senderId) {
    await registrar(u, "bloqueo", `Quiso cargar a ${nombre}, que es cliente de ${existe.owner.name}`, { contactId: existe.id });
    redirect(`/contactos?error=${encodeURIComponent(`No: ${nombre} ya lo contactó ${existe.owner.name}. Es su cliente.`)}`);
  }
  let id: string;
  if (data.email) {
    id = (await db.contact.upsert({ where: { email: data.email }, create: { ...data, ...extra, tags, ...dueno }, update: { ...data, ...extra, tags, ...(existe?.ownerId ? {} : dueno) } })).id;
  } else {
    id = (await db.contact.create({ data: { ...data, email: null, tags, ...dueno } })).id;
  }
  await registrar(u, "alta", `Cargó a ${nombre}`, { contactId: id });
  revalidatePath("/contactos");
}

export async function deleteContact(id: string) {
  const u = await usuarioActual();
  // un vendedor solo borra sus clientes o los libres
  const c = await db.contact.findUnique({ where: { id }, select: { ownerId: true } });
  if (!c || (!u.admin && c.ownerId && c.ownerId !== u.senderId)) return;
  await db.contact.delete({ where: { id } });
  revalidatePath("/contactos");
}

/** Solo el administrador: pasa contactos a un vendedor ("" = dejarlos libres). */
export async function asignarContactos(ids: string[], senderId: string): Promise<{ ok: string } | { error: string }> {
  const u = await usuarioActual();
  if (!u.admin) return { error: "Solo el administrador puede repartir clientes." };
  const sender = senderId ? await db.sender.findUnique({ where: { id: senderId }, select: { id: true, name: true } }) : null;
  if (senderId && !sender) return { error: "Ese vendedor ya no existe." };
  const r = await db.contact.updateMany({ where: { id: { in: ids.slice(0, 1000) } }, data: { ownerId: sender?.id ?? null, ownerAt: sender ? new Date() : null } });
  await registrar(u, "asigno", `Pasó ${r.count} ${r.count === 1 ? "contacto" : "contactos"} a ${sender?.name ?? "libres"}`);
  revalidatePath("/contactos");
  revalidatePath("/equipo");
  return { ok: `Listo: ${r.count} ${r.count === 1 ? "contacto pasó" : "contactos pasaron"} a ${sender?.name ?? "libres"}.` };
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
  const u = await usuarioActual();
  const dueno = !u.admin && u.senderId ? { ownerId: u.senderId, ownerAt: new Date() } : {};
  let created = 0, updated = 0, corregidos = 0, invalidos = 0, deOtro = 0;
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
    const existing = await db.contact.findUnique({ where: { email: c.email }, select: { tags: true, ownerId: true } });
    if (existing) {
      // el cliente de otro vendedor no se toca
      if (!u.admin && existing.ownerId && existing.ownerId !== u.senderId) {
        deOtro++;
        continue;
      }
      await db.contact.update({ where: { email: c.email }, data: { ...c, ...extra, tags: [...new Set([...existing.tags, ...tags])], ...(existing.ownerId ? {} : dueno) } });
      updated++;
    } else {
      await db.contact.create({ data: { ...c, ...extra, tags, ...dueno } });
      created++;
    }
  }
  await registrar(u, "importo", `Importó un CSV: ${created} nuevos, ${updated} actualizados${deOtro ? `, ${deOtro} de otro vendedor sin tocar` : ""}`);
  revalidatePath("/contactos");
  redirect(`/contactos?importados=${created}&actualizados=${updated}&omitidos=${skipped}&corregidos=${corregidos}&invalidos=${invalidos}${deOtro ? `&deotro=${deOtro}` : ""}`);
}
