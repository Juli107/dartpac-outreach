"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nextSendTime, windowFor } from "@/lib/schedule";
import { camposContacto, verificar } from "@/lib/verifier";
import { enrolarProspectos, type ResultadoEnrolar } from "@/lib/radar/outreach";
import { provNom } from "@/lib/radar/geo";
import type { RadarData } from "@/lib/radar/store";
import { waNum } from "@/lib/whatsapp";
import { quienSoy } from "@/lib/yo";
import { whereContactos, type BusquedaContactos } from "@/lib/contactos-filtros";
import { NO_CONTACTAR } from "@/lib/radar/espejo";
import { deOtroVendedor } from "@/lib/dueno";

export type Resultado = { ok?: string; error?: string };
export type ContactoHallado = { id: string; nombre: string; email: string | null; empresa: string | null; telefono: string | null; aviso: string | null };
export type EmpresaHallada = { id: string; nombre: string; lugar: string; email: string | null; telefono: string | null; ya: boolean; sinCanal: boolean; bloqueo: string | null };

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
    const tieneWa = !!(waNum(contact.whatsapp ?? "") || waNum(contact.phone ?? ""));
    const sinMail = contact.email ? "" : !tieneWa ? " Ojo: no tiene email ni un WhatsApp válido, así que no le va a llegar nada." : soloEmail ? " Como no tiene email, los pasos de email le llegan por WhatsApp (quedan en Tareas para mandarlos con un clic)." : "";
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

/** Qué empresas del Radar mostrar según cómo se les puede escribir. */
export type FiltroRadar = "todas" | "canal" | "email" | "wa";

/** Condiciones SQL del buscador del Radar: el texto buscado y, si se pide, que tenga email y/o WhatsApp. */
function whereRadar(q: string, filtro: FiltroRadar) {
  const t = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const like = `%${t.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const conEmail = Prisma.sql`coalesce(trim(data->>'email'), '') <> ''`;
  // aproximado (8 dígitos o más); waNum lo confirma después
  const conWa = Prisma.sql`(length(regexp_replace(coalesce(data->>'whatsapp', ''), '[^0-9]', '', 'g')) >= 8 OR length(regexp_replace(coalesce(data->>'telefono', ''), '[^0-9]', '', 'g')) >= 8)`;
  const canal =
    filtro === "email" ? Prisma.sql`AND ${conEmail}` :
    filtro === "wa" ? Prisma.sql`AND ${conWa}` :
    filtro === "canal" ? Prisma.sql`AND (${conEmail} OR ${conWa})` : Prisma.empty;
  return Prisma.sql`col = 'prospectos' AND deleted = false
      AND translate(lower(concat_ws(' ', data->>'nombre', data->>'ciudad', data->>'email', data->>'telefono', data->>'whatsapp')), 'áéíóúüñ', 'aeiouun') LIKE ${like}
      ${canal}`;
}

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const tieneWa = (p: RadarData) => !!(waNum(txt(p.whatsapp)) || waNum(txt(p.telefono)));
const noSePuede = (p: RadarData) => !!p.noContactar || p.etapa === "descartado";

/** Empresas del Radar (por nombre, ciudad, email o teléfono), marcando las que ya están en esta secuencia. */
export async function buscarRadar(sequenceId: string, q: string, filtro: FiltroRadar = "todas"): Promise<EmpresaHallada[]> {
  const rows = await db.$queryRaw<{ id: string; data: RadarData }[]>`
    SELECT id, data FROM "RadarDoc"
    WHERE ${whereRadar(q, filtro)}
    ORDER BY data->>'nombre'
    LIMIT 40`;
  const ids = rows.map((r) => r.id);
  const vinc = ids.length
    ? await db.contact.findMany({
        where: { radarId: { in: ids }, OR: [{ enrollments: { some: { sequenceId } } }, { unsubscribed: true }, { bounced: true }] },
        select: { radarId: true, unsubscribed: true, bounced: true, enrollments: { where: { sequenceId }, select: { id: true } } },
      })
    : [];
  const ya = new Set(vinc.filter((c) => c.enrollments.length).map((c) => c.radarId));
  const baja = new Map(vinc.filter((c) => c.unsubscribed || c.bounced).map((c) => [c.radarId, c.unsubscribed ? "Pidió la baja" : "Rebotó"]));
  return rows.map(({ id, data: p }) => ({
    id,
    nombre: txt(p.nombre) || "Sin nombre",
    lugar: [txt(p.ciudad), provNom(txt(p.provincia))].filter(Boolean).join(", "),
    email: txt(p.email) || null,
    telefono: txt(p.whatsapp) || txt(p.telefono) || null,
    ya: ya.has(id),
    sinCanal: !txt(p.email) && !tieneWa(p),
    bloqueo: noSePuede(p) ? "No contactar" : baja.get(id) ?? null,
  }));
}

/**
 * Todas las empresas del Radar que cumplen la búsqueda y el filtro y que se pueden sumar: con email y/o WhatsApp
 * (según el filtro), sin «no contactar» ni descartadas, que no estén ya en esta secuencia y cuyo contacto no haya
 * pedido la baja ni rebotado.
 */
export async function idsRadar(sequenceId: string, q: string, filtro: FiltroRadar): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string; data: RadarData }[]>`
    SELECT id, jsonb_build_object('email', data->'email', 'whatsapp', data->'whatsapp', 'telefono', data->'telefono',
      'noContactar', data->'noContactar', 'etapa', data->'etapa') AS data
    FROM "RadarDoc"
    WHERE ${whereRadar(q, filtro)}
    ORDER BY data->>'nombre'`;
  const sirve = rows.filter(({ data: p }) => {
    if (noSePuede(p)) return false;
    const mail = !!txt(p.email), wa = tieneWa(p);
    return filtro === "email" ? mail : filtro === "wa" ? wa : mail || wa;
  });
  if (!sirve.length) return [];
  const fuera = await db.contact.findMany({
    where: {
      radarId: { in: sirve.map((r) => r.id) },
      OR: [{ enrollments: { some: { sequenceId } } }, { unsubscribed: true }, { bounced: true }],
    },
    select: { radarId: true },
  });
  const no = new Set(fuera.map((c) => c.radarId));
  return sirve.map((r) => r.id).filter((id) => !no.has(id));
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
    if (r.bajas) partes.push(`${plural(r.bajas, "omitida", "omitidas")} por baja o rebote`);
    if (r.deOtro) partes.push(`${plural(r.deOtro, "la trabaja", "las trabaja")} otro vendedor`);
    if (r.corregidos) partes.push(plural(r.corregidos, "email corregido", "emails corregidos"));
    return { ok: partes.join(" · ") + "." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo sumar." };
  }
}

/** Una tanda de la carga masiva del Radar: devuelve los números para que la pantalla los vaya sumando. */
export async function inscribirRadarTanda(sequenceId: string, ids: string[]): Promise<ResultadoEnrolar | { error: string }> {
  try {
    const yo = await quienSoy().catch(() => null);
    const r = await enrolarProspectos(sequenceId, ids.slice(0, 50), yo?.name.split(/\s+/)[0] ?? "Outreach");
    refresh(sequenceId);
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo sumar." };
  }
}

export type ResultadoContactos = { sumadas: number; yaEstaban: number; bajas: number; sinCanal: number; corregidos: number; deOtro: Record<string, number> };

/**
 * Contactos que cumplen la búsqueda y el filtro de la página de Contactos y que se pueden sumar a esta secuencia:
 * sin baja, sin rebote, sin «no contactar» y que todavía no estén en ella.
 */
export async function idsContactos(sequenceId: string, b: BusquedaContactos): Promise<string[]> {
  const rows = await db.contact.findMany({
    where: { AND: [whereContactos(b), { unsubscribed: false, bounced: false, NOT: { tags: { has: NO_CONTACTAR } }, enrollments: { none: { sequenceId } } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    take: 20_000,
  });
  return rows.map((r) => r.id);
}

/**
 * Una tanda de «Sumar a una secuencia» desde Contactos. Los emails sin revisar pasan por el verificador (los tipeos
 * evidentes se corrigen) y no se suma a quien no le llegaría ningún paso: sin email válido y sin WhatsApp.
 */
export async function inscribirContactosTanda(sequenceId: string, ids: string[], igual = false): Promise<ResultadoContactos | { error: string }> {
  try {
    const { seq, first, runAt } = await inicio(sequenceId);
    const r: ResultadoContactos = { sumadas: 0, yaEstaban: 0, bajas: 0, sinCanal: 0, corregidos: 0, deOtro: {} };
    // a una empresa que ya trabaja otro vendedor no se le escribe dos veces (salvo que se pida sumarla igual)
    const otros = igual ? new Map<string, string>() : await deOtroVendedor(sequenceId, ids.slice(0, 50));
    const rows = await db.contact.findMany({
      where: { id: { in: ids.slice(0, 50) } },
      include: { enrollments: { where: { sequenceId }, select: { id: true } } },
    });
    const sumar: string[] = [];
    for (let c of rows) {
      if (c.enrollments.length) { r.yaEstaban++; continue; }
      if (c.unsubscribed || c.bounced || c.tags.includes(NO_CONTACTAR)) { r.bajas++; continue; }
      const otro = otros.get(c.id);
      if (otro) { r.deOtro[otro] = (r.deOtro[otro] ?? 0) + 1; continue; }
      if (c.email && !c.emailCheckedAt) {
        let v = await verificar(c.email);
        let email = c.email;
        if (v.estado === "corregible" && v.sugerencia && !(await db.contact.findUnique({ where: { email: v.sugerencia }, select: { id: true } }))) {
          email = v.sugerencia;
          v = await verificar(email);
          r.corregidos++;
        }
        c = { ...c, ...(await db.contact.update({ where: { id: c.id }, data: { email, ...camposContacto(v) } })) };
      }
      const mail = !!c.email && c.emailStatus !== "invalido" && c.emailStatus !== "corregible";
      const wa = !!(waNum(c.whatsapp ?? "") || waNum(c.phone ?? ""));
      // sin email el paso de email sale por WhatsApp, y al revés: alcanza con uno de los dos
      if (!mail && !wa) { r.sinCanal++; continue; }
      sumar.push(c.id);
    }
    if (sumar.length) {
      r.sumadas = (await db.enrollment.createMany({ data: sumar.map((contactId) => ({ sequenceId, contactId, nextStep: first.order, nextRunAt: runAt })), skipDuplicates: true })).count;
    }
    refresh(sequenceId);
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo sumar." };
  }
}
