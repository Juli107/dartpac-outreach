/**
 * Lo que pasa cuando un cliente escribe al número de la API: se guarda la conversación, aparece en la
 * Bandeja, el contacto sale de sus secuencias y, si el bot está encendido, contesta solo.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { waNum } from "./whatsapp";
import { sendWaText } from "./whatsapp-api";
import { eventoRadar } from "./radar/outreach";
import { botEncendido, botEnPausa, conversacionBot, instruccionesBot, ventanaAbierta, SALUDO_POR_DEFECTO, type WaEntrante } from "./whatsapp-bot";

const TIPOS: Record<string, string> = { audio: "audio", image: "foto", video: "video", document: "archivo", sticker: "sticker", location: "ubicación", contacts: "contacto" };

/** Contacto con ese WhatsApp o teléfono; si no hay, se crea (es una consulta nueva). */
async function contactoDe(m: WaEntrante) {
  const fin = m.from.slice(-4);
  const candidatos = await db.contact.findMany({
    where: { OR: [{ whatsapp: { contains: fin } }, { phone: { contains: fin } }] },
    select: { id: true, radarId: true, whatsapp: true, phone: true },
    take: 200,
  });
  const igual = candidatos.find((c) => waNum(c.whatsapp) === m.from || waNum(c.phone) === m.from);
  if (igual) return igual;
  const [firstName, ...resto] = m.name.trim().split(/\s+/);
  return db.contact.create({
    data: { firstName: firstName || null, lastName: resto.join(" ") || null, whatsapp: `+${m.from}`, tags: ["whatsapp"] },
    select: { id: true, radarId: true, whatsapp: true, phone: true },
  });
}

export async function recibirWhatsApp(m: WaEntrante) {
  if (await db.waChat.findUnique({ where: { wamid: m.wamid } })) return; // Meta a veces repite el aviso
  const contact = await contactoDe(m);
  const body = m.text || `[${TIPOS[m.type] ?? m.type}]`;
  await db.waChat.create({ data: { waId: m.from, phoneNumberId: m.phoneNumberId, name: m.name, direction: "in", by: "cliente", body, wamid: m.wamid, contactId: contact.id, at: m.at } });
  await db.reply.create({
    data: { contactId: contact.id, messageId: m.wamid, subject: "WhatsApp", body, receivedAt: m.at, mailbox: "whatsapp" },
  }).catch(() => {});
  await db.enrollment.updateMany({ where: { contactId: contact.id, status: "ACTIVE" }, data: { status: "REPLIED", nextRunAt: null } });
  await eventoRadar(contact, { k: "respuesta", asunto: "WhatsApp" });

  if (!botEncendido()) return;
  const historial = await db.waChat.findMany({ where: { waId: m.from }, orderBy: { at: "desc" }, take: 30 });
  if (botEnPausa(historial) || !ventanaAbierta(historial)) return;
  const texto = await respuestaBot(historial, !m.text);
  if (!texto) return;
  try {
    const wamid = await sendWaText({ phoneNumberId: m.phoneNumberId, to: m.from, text: texto });
    await db.waChat.create({ data: { waId: m.from, phoneNumberId: m.phoneNumberId, direction: "out", by: "bot", body: texto, wamid, contactId: contact.id } });
  } catch (e) {
    await db.waChat.create({ data: { waId: m.from, phoneNumberId: m.phoneNumberId, direction: "out", by: "bot", body: texto, contactId: contact.id, error: String(e instanceof Error ? e.message : e).slice(0, 500) } });
  }
}

/**
 * Qué contesta el bot. Con ANTHROPIC_API_KEY responde Claude con la información del negocio;
 * sin ella (o si Claude falla) manda el saludo fijo, una sola vez por día y cliente.
 */
async function respuestaBot(todo: { direction: string; by: string; body: string; at: Date; error: string | null }[], sinTexto: boolean) {
  const historial = todo.filter((l) => !l.error); // lo que no llegó al cliente no cuenta
  const s = await db.setting.findUnique({ where: { id: "app" }, select: { botInfo: true, botSaludo: true } });
  const saludo = s?.botSaludo.trim() || SALUDO_POR_DEFECTO;
  const yaSaludo = historial.some((l) => l.by === "bot" && Date.now() - l.at.getTime() < 24 * 3600_000);
  const fijo = yaSaludo ? null : saludo;
  if (!process.env.ANTHROPIC_API_KEY || sinTexto) return fijo;
  try {
    const client = new Anthropic();
    const r = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: instruccionesBot(s?.botInfo ?? ""),
      messages: conversacionBot(historial),
    });
    if (r.stop_reason === "refusal") return fijo;
    const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return texto || fijo;
  } catch (e) {
    console.error("bot de WhatsApp", e);
    return fijo;
  }
}
