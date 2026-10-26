"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { nextSendTime, windowFor } from "@/lib/schedule";
import { camposContacto, verificar } from "@/lib/verifier";
import { enrolarProspectos } from "@/lib/radar/outreach";
import { provNom } from "@/lib/radar/geo";
import type { RadarData } from "@/lib/radar/store";
import { waNum } from "@/lib/whatsapp";
import { quienSoy } from "@/lib/yo";

export type Resultado = { ok?: string; error?: string };
export type ContactoHallado = { id: string; nombre: string; email: string | null; empresa: string | null; telefono: string | null; aviso: string | null };
export type EmpresaHallada = { id: string; nombre: string; lugar: string; email: string | null; telefono: string | null; ya: boolean; sinCanal: boolean };

const plural = (n: number, a: string, b: string) => `${n.toLocaleString("es-AR")} ${n === 1 ? a : b}`;

function refresh(id: string) {
  revalidatePath(`/secuencias/${id}`);
  revalidatePath("/secuencias");
  revalidatePath("/contactos");
}

/** La secuencia con su primer paso y cuándo saldría ese paso para alguien que se suma ahora. */
async function inicio(sequenceId: string) {
  const seq = await db.sequence.findUnique({ where: { id: sequenceId }, include: { steps: { orderBy: { order: "asc" }, select: { order: true, delayDays: true, type: true } } } });
  if (!seq || seq.status === "ARCHIVED") throw new Error("Esa secuencia ya no existe.");
  const first = seq.steps[0];
  if (!first) throw new Error("La secuencia todavía no tiene pasos: agregale al menos uno en la pestaña Pasos.");
  return { seq, first, runAt: nextSendTime(new Date(), first.delayDays, windowFor(seq)), soloEmail: seq.steps.every((s) => s.type === "EMAIL") };
}

/**
 * Una persona, cargada a mano: se crea (o se actualiza si el email ya existe) y se suma a la secuencia.
 * Los errores de tipeo evidentes del email se corrigen solos; un email inválido no se guarda.
 */
export async function agregarPersona(sequenceId: string, _prev: Resultado | null, form: FormData): Promise<Resultado> {
  const g = (k: string) => String(form.get(k) ?? "").trim();
  let email = g("email").toLowerCase();
  const phone = g("phone");
  const datos = { firstName: g("firstName") || null, lastName: g("lastName") || null, company: g("company") || null, title: g("title") || null };
  if (!email && !phone) return { error: "Cargá al menos un email o un teléfono." };
  let nota = "";
  let vfy = email ? await verificar(email) : null;
  if (vfy?.estado === "corregible" && vfy.sugerencia) {
    nota = ` El email tenía un error de tipeo y quedó como ${vfy.sugerencia}.`;
    email = vfy.sugerencia;
    vfy = await verificar(email);
  }
  if (vfy?.estado === "invalido") return { error: `Ese email no sirve: ${vfy.motivos[0]?.t ?? "revisalo"}. Corregilo o dejalo vacío y cargá el teléfono.` };
  try {
    const { first, runAt, soloEmail } = await inicio(sequenceId);
    const extra = vfy ? camposContacto(vfy) : {};
    const telefono = phone ? { phone, ...(waNum(phone) ? { whatsapp: phone } : {}) } : {};
    let contact = email
      ? await db.contact.findUnique({ where: { email } })
      : phone ? await db.contact.findFirst({ where: { OR: [{ phone }, { whatsapp: phone }] } }) : null;
    if (contact) {
      // completa lo que faltaba sin pisar lo que ya tenía
      contact = await db.contact.update({
        where: { id: contact.id },
        data: {
          firstName: contact.firstName ?? datos.firstName,
          lastName: contact.lastName ?? datos.lastName,
          company: contact.company ?? datos.company,
          title: contact.title ?? datos.title,
          ...(contact.phone ? {} : telefono),
          ...(email && !contact.emailStatus ? extra : {}),
        },
      });
    } else {
      contact = await db.contact.create({ data: { ...datos, email: email || null, ...telefono, ...extra, tags: ["cargado a mano"] } });
    }
    const quien = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.company || contact.email || contact.phone || "La persona";
    if (contact.unsubscribed) return { error: `${quien} pidió la baja: no se le puede escribir.` };
    if (contact.bounced) return { error: `Los mails a ${quien} rebotaron: corregí su email en Contactos antes de sumarla.` };
    const ya = await db.enrollment.findUnique({ where: { sequenceId_contactId: { sequenceId, contactId: contact.id } }, select: { id: true } });
    if (ya) return { ok: `${quien} ya estaba en esta secuencia.${nota}` };
    await db.enrollment.create({ data: { sequenceId, contactId: contact.id, nextStep: first.order, nextRunAt: runAt } });
    refresh(sequenceId);
    const sinMail = soloEmail && !contact.email ? " Ojo: no tiene email y esta secuencia es solo de emails, así que no le va a llegar nada." : "";
    return { ok: `Listo: ${quien} quedó en la secuencia.${nota}${sinMail}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo agregar." };
  }
}

/** Contactos de Outreach que todavía no están en esta secuencia (por nombre, empresa, email o teléfono). */
export async function buscarContactos(sequenceId: string, q: string): Promise<ContactoHallado[]> {
  const t = q.trim();
  const rows = await db.contact.findMany({
    where: {
      enrollments: { none: { sequenceId } },
      ...(t
        ? {
            OR: [
              { email: { contains: t, mode: "insensitive" } },
              { firstName: { contains: t, mode: "insensitive" } },
              { lastName: { contains: t, mode: "insensitive" } },
              { company: { contains: t, mode: "insensitive" } },
              { phone: { contains: t } },
              { tags: { has: t.toLowerCase() } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, firstName: true, lastName: true, email: true, company: true, phone: true, whatsapp: true, unsubscribed: true, bounced: true, emailStatus: true },
  });
  return rows.map((c) => ({
    id: c.id,
    nombre: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || c.phone || "Sin nombre",
    email: c.email,
    empresa: c.company,
    telefono: c.whatsapp ?? c.phone,
    aviso: c.unsubscribed ? "Pidió la baja" : c.bounced ? "Rebotó" : c.emailStatus === "invalido" ? "Email inválido" : null,
  }));
}

/** Suma a la secuencia los contactos elegidos (menos las bajas y los rebotados). */
export async function inscribirContactos(sequenceId: string, ids: string[]): Promise<Resultado> {
  try {
    const { first, runAt } = await inicio(sequenceId);
    const ok = await db.contact.findMany({
      where: { id: { in: ids.slice(0, 1000) }, unsubscribed: false, bounced: false, enrollments: { none: { sequenceId } } },
      select: { id: true },
    });
    await db.enrollment.createMany({ data: ok.map((c) => ({ sequenceId, contactId: c.id, nextStep: first.order, nextRunAt: runAt })), skipDuplicates: true });
    refresh(sequenceId);
    const fuera = ids.length - ok.length;
    return { ok: `${plural(ok.length, "persona sumada", "personas sumadas")} a la secuencia.${fuera ? ` ${plural(fuera, "quedó afuera", "quedaron afuera")} (bajas, rebotes o ya estaban).` : ""}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo sumar." };
  }
}

/** Empresas del Radar (por nombre, ciudad, email o teléfono), marcando las que ya están en esta secuencia. */
export async function buscarRadar(sequenceId: string, q: string): Promise<EmpresaHallada[]> {
  const t = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const like = `%${t.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const rows = await db.$queryRaw<{ id: string; data: RadarData }[]>`
    SELECT id, data FROM "RadarDoc"
    WHERE col = 'prospectos' AND deleted = false
      AND translate(lower(concat_ws(' ', data->>'nombre', data->>'ciudad', data->>'email', data->>'telefono', data->>'whatsapp')), 'áéíóúüñ', 'aeiouun') LIKE ${like}
    ORDER BY data->>'nombre'
    LIMIT 40`;
  const ids = rows.map((r) => r.id);
  const en = ids.length
    ? await db.contact.findMany({ where: { radarId: { in: ids }, enrollments: { some: { sequenceId } } }, select: { radarId: true } })
    : [];
  const ya = new Set(en.map((c) => c.radarId));
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return rows.map(({ id, data: p }) => ({
    id,
    nombre: s(p.nombre) || "Sin nombre",
    lugar: [s(p.ciudad), provNom(s(p.provincia))].filter(Boolean).join(", "),
    email: s(p.email) || null,
    telefono: s(p.whatsapp) || s(p.telefono) || null,
    ya: ya.has(id),
    sinCanal: !s(p.email) && !waNum(s(p.whatsapp)) && !waNum(s(p.telefono)),
  }));
}

/** Suma a la secuencia las empresas elegidas del Radar (crea o vincula su contacto en Outreach). */
export async function inscribirRadar(sequenceId: string, ids: string[]): Promise<Resultado> {
  try {
    const yo = await quienSoy().catch(() => null);
    const r = await enrolarProspectos(sequenceId, ids, yo?.name.split(/\s+/)[0] ?? "Outreach");
    refresh(sequenceId);
    const partes = [plural(r.sumadas, "empresa sumada", "empresas sumadas")];
    if (r.yaEstaban) partes.push(plural(r.yaEstaban, "ya estaba", "ya estaban"));
    if (r.sinCanal) partes.push(`${plural(r.sinCanal, "sin email ni WhatsApp", "sin email ni WhatsApp")} (o descartadas)`);
    if (r.corregidos) partes.push(plural(r.corregidos, "email corregido", "emails corregidos"));
    return { ok: partes.join(" · ") + "." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo sumar." };
  }
}
