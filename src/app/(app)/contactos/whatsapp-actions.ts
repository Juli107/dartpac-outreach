"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { contactWa, waLink, waNum } from "@/lib/whatsapp";
import { renderTemplate } from "@/lib/template";
import { cargarVariables } from "@/lib/variables";
import { usuarioActual, type Usuario } from "@/lib/usuario";
import { registrar } from "@/lib/actividad";
import { tomarClientes } from "@/lib/dueno";
import { touchProspect } from "@/lib/radar/store";
import { fullName } from "@/lib/labels";

/**
 * WhatsApp directo desde Contactos: el vendedor abre el chat con el cliente desde SU WhatsApp (el que tiene cargado
 * en Remitentes), con el mensaje ya escrito. No sale nada solo: la persona aprieta enviar en su WhatsApp.
 */
const TEXTO =
  "{{saludo}} {{nombre|}}, ¿cómo estás? Soy {{vendedor}} de {{mi_empresa}}. Trabajamos film stretch, bolsas y descartables para comercios como {{empresa|el tuyo}}. ¿Te paso el catálogo y la lista de precios?";

export type VistaWa = {
  error?: string;
  contacto?: string;
  numero?: string;
  texto?: string;
  remitenteId?: string;
  /** Quién escribe y desde qué número. */
  de?: { nombre: string; whatsapp: string };
  remitentes?: { id: string; nombre: string; whatsapp: string }[];
};

async function remitente(u: Usuario, pedido?: string) {
  const id = u.admin ? pedido || u.senderId : u.senderId;
  return id ? db.sender.findUnique({ where: { id }, select: { id: true, name: true, whatsapp: true } }) : null;
}

/** Si el cliente es de otro vendedor, el motivo para no escribirle (el administrador puede igual). */
async function deOtro(u: Usuario, c: { id: string; ownerId: string | null }, senderId: string) {
  if (u.admin || !c.ownerId || c.ownerId === senderId) return null;
  const o = await db.sender.findUnique({ where: { id: c.ownerId }, select: { name: true } });
  return o?.name ?? "otro vendedor";
}

/** El mensaje listo para este contacto, firmado por quien escribe. */
export async function vistaWhatsapp(contactId: string, remitenteId?: string): Promise<VistaWa> {
  const u = await usuarioActual();
  const c = await db.contact.findUnique({ where: { id: contactId } });
  if (!c) return { error: "Ese contacto ya no existe." };
  const numero = contactWa(c);
  if (!numero) return { error: "Este contacto no tiene un WhatsApp válido cargado." };
  const remitentes = u.admin
    ? (await db.sender.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, whatsapp: true } })).map((s) => ({ id: s.id, nombre: s.name, whatsapp: s.whatsapp }))
    : undefined;
  // el administrador escribe desde su número si lo tiene cargado; si no, desde el primero que tenga WhatsApp
  const propio = remitentes?.find((r) => r.id === u.senderId && waNum(r.whatsapp));
  const s = await remitente(u, remitenteId || propio?.id || remitentes?.find((r) => waNum(r.whatsapp))?.id);
  if (!s) return { error: "Entrá con tu cuenta de Google para escribir desde tu WhatsApp.", remitentes };
  if (!waNum(s.whatsapp)) return { error: `Falta cargar el WhatsApp de ${s.name} en Remitentes.`, remitentes, remitenteId: s.id };
  const otro = await deOtro(u, c, s.id);
  if (otro) return { error: `No le podés escribir: ${fullName(c)} ya lo contactó ${otro}. Es su cliente.` };
  const vars = await cargarVariables();
  return {
    contacto: fullName(c),
    numero: "+" + numero,
    // sin nombre queda «Buenos días, ¿cómo estás?…»
    texto: renderTemplate(TEXTO, c, { sender: s, vars }).replace(/\s+,/g, ","),
    remitenteId: s.id,
    de: { nombre: s.name, whatsapp: s.whatsapp },
    remitentes,
  };
}

/**
 * Anota el WhatsApp (actividad, dueño del cliente y ficha del Radar) y devuelve el enlace que abre el chat.
 * No envía nada: el mensaje sale cuando la persona lo manda desde su WhatsApp.
 */
export async function abrirWhatsapp(contactId: string, texto: string, remitenteId?: string): Promise<{ link?: string; error?: string }> {
  const u = await usuarioActual();
  const c = await db.contact.findUnique({ where: { id: contactId } });
  if (!c) return { error: "Ese contacto ya no existe." };
  const numero = contactWa(c);
  if (!numero) return { error: "Este contacto no tiene un WhatsApp válido cargado." };
  const s = await remitente(u, remitenteId);
  if (!s || !waNum(s.whatsapp)) return { error: "Falta cargar tu WhatsApp en Remitentes." };
  const otro = await deOtro(u, c, s.id);
  if (otro) {
    await registrar(u, "bloqueo", `Quiso escribirle por WhatsApp a ${fullName(c)}, que es cliente de ${otro}`, { contactId: c.id });
    return { error: `No le podés escribir: ${fullName(c)} ya lo contactó ${otro}. Es su cliente.` };
  }
  await tomarClientes([c.id], s.id);
  await registrar(u.senderId ? u : { name: s.name, senderId: s.id }, "mensaje", `WhatsApp a ${fullName(c)} desde el número de ${s.name.split(/\s+/)[0]}`, { contactId: c.id });
  if (c.radarId) {
    await touchProspect(c.radarId, { tipo: "envio", texto: "WhatsApp desde Contactos de Outreach", por: s.name.split(/\s+/)[0] }, (p) =>
      (p.etapa ?? "nuevo") === "nuevo" ? { etapa: "contactado" } : {},
    );
  }
  revalidatePath("/contactos");
  return { link: waLink(numero, texto.trim()) };
}
