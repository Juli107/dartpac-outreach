import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { nextSendTime, windowFor } from "../schedule";
import { camposContacto, verificar } from "../verifier";
import { waNum } from "../whatsapp";
import { getDoc, hoyAR, touchProspect, type RadarData } from "./store";
import { provNom, rubNom } from "./geo";
import { deOtroVendedor } from "../dueno";

/**
 * Puente entre el Radar y las secuencias de Outreach: una empresa del Radar se suma a una secuencia como contacto
 * (con o sin email), y lo que pasa en la secuencia (mails, WhatsApp, respuestas, rebotes, bajas) vuelve a su ficha.
 */
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function datosContacto(radarId: string, p: RadarData) {
  return {
    company: s(p.nombre) || null,
    phone: s(p.telefono) || null,
    whatsapp: s(p.whatsapp) || null,
    city: s(p.ciudad) || null,
    province: p.provincia ? provNom(String(p.provincia)) : null,
    website: s(p.web) || null,
    radarId,
  };
}

export type ResultadoEnrolar = { sumadas: number; yaEstaban: number; sinEmail: number; emailMalo: number; sinCanal: number; corregidos: number; noEncontradas: number; bajas: number; deOtro: number };

/** Suma empresas del Radar a una secuencia de Outreach. Verifica cada email antes (y corrige tipeos evidentes). */
export async function enrolarProspectos(sequenceId: string, ids: string[], por = "Outreach"): Promise<ResultadoEnrolar> {
  const seq = await db.sequence.findUnique({ where: { id: sequenceId }, include: { steps: { orderBy: { order: "asc" } } } });
  if (!seq || seq.status === "ARCHIVED") throw new Error("Esa secuencia ya no existe.");
  const first = seq.steps[0];
  if (!first) throw new Error("La secuencia no tiene pasos: agregale al menos uno en Outreach.");
  const tieneMail = seq.steps.some((st) => st.type === "EMAIL");
  const r: ResultadoEnrolar = { sumadas: 0, yaEstaban: 0, sinEmail: 0, emailMalo: 0, sinCanal: 0, corregidos: 0, noEncontradas: 0, bajas: 0, deOtro: 0 };
  const runAt = nextSendTime(new Date(), first.delayDays, windowFor(seq));

  for (const id of [...new Set(ids)].slice(0, 500)) {
    const doc = await getDoc("prospectos", id);
    if (!doc) {
      r.noEncontradas++;
      continue;
    }
    const p = doc.data;
    if (p.noContactar || p.etapa === "descartado") {
      r.sinCanal++;
      continue;
    }
    let email = s(p.email).toLowerCase() || null;
    let vfy = email ? await verificar(email) : null;
    let corregido = "";
    if (vfy?.estado === "corregible" && vfy.sugerencia) {
      corregido = `${email} → ${vfy.sugerencia}`;
      email = vfy.sugerencia;
      vfy = await verificar(email);
      r.corregidos++;
    }
    if (email && (vfy?.estado === "invalido" || p.emailRebotado)) r.emailMalo++;
    const tieneWa = !!(waNum(s(p.whatsapp)) || waNum(s(p.telefono)));
    if (!email && !tieneWa) {
      r.sinCanal++;
      continue;
    }

    // contacto: el ya vinculado a esta empresa, o uno con el mismo email, o uno nuevo
    const base = datosContacto(id, p);
    let contact = await db.contact.findFirst({ where: { radarId: id } });
    if (!contact && email) contact = await db.contact.findUnique({ where: { email } });
    // a quien pidió la baja o rebotó no se le vuelve a escribir
    if (contact && (contact.unsubscribed || contact.bounced)) {
      r.bajas++;
      continue;
    }
    const emailData = email && vfy ? { email, ...camposContacto(vfy) } : {};
    if (contact) {
      const taken = email && contact.email !== email ? await db.contact.findUnique({ where: { email }, select: { id: true } }) : null;
      contact = await db.contact.update({
        where: { id: contact.id },
        data: {
          company: contact.company ?? base.company,
          phone: contact.phone ?? base.phone,
          whatsapp: contact.whatsapp ?? base.whatsapp,
          city: contact.city ?? base.city,
          province: contact.province ?? base.province,
          website: contact.website ?? base.website,
          ...(contact.radarId ? {} : { radarId: id }),
          ...(taken ? {} : emailData),
          tags: [...new Set([...contact.tags, "radar"])],
        },
      });
    } else {
      contact = await db.contact.create({
        data: { ...base, ...emailData, tags: ["radar", rubNom(String(p.rubro ?? "otro")).toLowerCase()] },
      });
    }
    if (tieneMail && !(contact.email && contact.emailStatus !== "invalido" && contact.emailStatus !== "corregible")) r.sinEmail++;

    const ya = await db.enrollment.findUnique({ where: { sequenceId_contactId: { sequenceId, contactId: contact.id } }, select: { id: true } });
    if (ya) {
      r.yaEstaban++;
      continue;
    }
    // la empresa ya la trabaja otro vendedor: no se le escribe dos veces
    if ((await deOtroVendedor(sequenceId, [contact.id])).size) {
      r.deOtro++;
      continue;
    }
    await db.enrollment.create({ data: { sequenceId, contactId: contact.id, nextStep: first.order, nextRunAt: runAt } });
    r.sumadas++;
    await touchProspect(
      id,
      { tipo: "dato", texto: `Sumado a la secuencia «${seq.name}» de Outreach${corregido ? ` · email corregido: ${corregido}` : ""}`, por },
      { outreach: { sid: seq.id, nombre: seq.name, desde: hoyAR(), cid: contact.id }, proximo: "", ...(corregido ? { email } : {}) },
    );
  }
  return r;
}

type Evento =
  | { k: "mail"; secuencia: string; paso: number; asunto: string; por?: string }
  | { k: "wa"; secuencia: string; por?: string }
  | { k: "tarea"; secuencia: string; titulo: string; por?: string }
  | { k: "respuesta"; asunto: string }
  | { k: "rebote" }
  | { k: "baja" }
  | { k: "fin"; motivo: "completa" | "sacado" | "borrada" };

/** Lleva a la ficha del Radar lo que pasó en Outreach con un contacto que salió del Radar. Nunca falla. */
export async function eventoRadar(contact: { radarId?: string | null } | string | null | undefined, ev: Evento) {
  try {
    let radarId: string | null | undefined = typeof contact === "string" ? null : contact?.radarId;
    if (typeof contact === "string") radarId = (await db.contact.findUnique({ where: { id: contact }, select: { radarId: true } }))?.radarId;
    if (!radarId) return;
    const contactado = (p: RadarData) => ((p.etapa ?? "nuevo") === "nuevo" ? { etapa: "contactado" } : {});
    const fin = (p: RadarData, motivo: string) => (p.outreach && typeof p.outreach === "object" ? { outreach: { ...(p.outreach as object), fin: motivo, finT: Date.now() } } : {});
    switch (ev.k) {
      case "mail":
        return await touchProspect(radarId, { tipo: "mail", texto: `Mail de la secuencia «${ev.secuencia}» (paso ${ev.paso}): ${ev.asunto}`, por: ev.por }, contactado);
      case "wa":
        return await touchProspect(radarId, { tipo: "envio", texto: `WhatsApp de la secuencia «${ev.secuencia}»`, por: ev.por }, contactado);
      case "tarea":
        return await touchProspect(radarId, { tipo: "contacto", texto: `Tarea de la secuencia «${ev.secuencia}»: ${ev.titulo}`, por: ev.por }, contactado);
      case "respuesta":
        return await touchProspect(radarId, { tipo: "dato", texto: `Respondió por mail: ${ev.asunto}`, por: "Outreach" }, (p) => ({
          ...(["nuevo", "contactado", undefined].includes(p.etapa as string | undefined) ? { etapa: "respondio" } : {}),
          ...fin(p, "respondio"),
        }));
      case "rebote":
        return await touchProspect(radarId, { tipo: "dato", texto: "El mail rebotó: la dirección no existe o no recibe correos", por: "Outreach" }, (p) => ({ emailRebotado: true, ...fin(p, "rebotado") }));
      case "baja":
        return await touchProspect(radarId, { tipo: "dato", texto: "Pidió la baja desde el link del mail", por: "Outreach" }, (p) => ({ noContactar: { t: Date.now(), motivo: "Pidió la baja desde el mail" }, proximo: "", ...fin(p, "baja") }));
      case "fin":
        return await touchProspect(radarId, ev.motivo === "completa" ? { tipo: "dato", texto: "Terminó todos los pasos de su secuencia de Outreach", por: "Outreach" } : null, (p) => fin(p, ev.motivo));
    }
  } catch (e) {
    console.error("eventoRadar", e);
  }
}

/** Contactos ya vinculados a una lista de empresas del Radar (para avisar quién está en secuencia). */
export async function contactosDeRadar(ids: string[]) {
  const rows = await db.contact.findMany({ where: { radarId: { in: ids } } as Prisma.ContactWhereInput, select: { id: true, radarId: true } });
  return new Map(rows.map((r) => [r.radarId!, r.id]));
}
