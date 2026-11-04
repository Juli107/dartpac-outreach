import { db } from "./db";
import { adminEmails, primerNombre } from "./usuario";
import { mailboxFor, newMessageId, sendRawEmail, senderConnected } from "./mailer";
import { ahoraAR } from "./reparto";
import { todayStart } from "./quota";
import { contarPorPersona, enviosDesde } from "./envios";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Lo que hizo el equipo hoy: envíos por persona, respuestas, búsquedas y clientes nuevos. */
export async function armarResumen(now = new Date()) {
  const desde = todayStart(now);
  const senders = await db.sender.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const [envios, respuestas, busquedas, nuevos] = await Promise.all([
    enviosDesde(desde, senders),
    db.reply.count({ where: { receivedAt: { gte: desde } } }),
    db.actividad.count({ where: { at: { gte: desde }, tipo: "busqueda" } }),
    db.contact.count({ where: { createdAt: { gte: desde } } }),
  ]);
  const filas = contarPorPersona(envios, senders);
  const tot = { mail: 0, whatsapp: 0, llamada: 0 };
  for (const f of filas) { tot.mail += f.mail; tot.whatsapp += f.whatsapp; tot.llamada += f.llamada; }
  const fecha = now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });
  const base = process.env.APP_URL ?? "https://outreach.plupackembalajes.com";

  const subject = `Resumen del día · ${tot.mail} mails, ${tot.whatsapp} WhatsApp y ${tot.llamada} llamadas`;
  const lineas = filas.map((f) => `- ${f.name}: ${f.mail} mails, ${f.whatsapp} WhatsApp, ${f.llamada} llamadas (${f.personas.size} empresas)`);
  const text = [
    `Resumen de Dartpac Outreach, ${fecha}.`,
    "",
    ...lineas,
    "",
    `Respuestas recibidas: ${respuestas}. Búsquedas de clientes: ${busquedas}. Contactos nuevos: ${nuevos}.`,
    "",
    `El detalle, con a quién le escribió cada uno: ${base}/envios`,
  ].join("\n");
  const td = 'style="padding:8px 12px;border-bottom:1px solid #e6eaf0;text-align:right"';
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#0B2545;max-width:560px">
<p style="font-size:13px;color:#5E7398;margin:0 0 4px">Dartpac Outreach</p>
<h2 style="margin:0 0 16px;font-size:20px">Resumen del ${esc(fecha)}</h2>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#0B2545;color:#fff"><th style="padding:8px 12px;text-align:left">Remitente</th><th ${td.replace("border-bottom:1px solid #e6eaf0;", "")}>Mails</th><th ${td.replace("border-bottom:1px solid #e6eaf0;", "")}>WhatsApp</th><th ${td.replace("border-bottom:1px solid #e6eaf0;", "")}>Llamadas</th><th ${td.replace("border-bottom:1px solid #e6eaf0;", "")}>Empresas</th></tr>
${filas.map((f) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e6eaf0">${esc(f.name)}</td><td ${td}>${f.mail}</td><td ${td}>${f.whatsapp}</td><td ${td}>${f.llamada}</td><td ${td}>${f.personas.size}</td></tr>`).join("")}
<tr style="font-weight:600"><td style="padding:8px 12px">Total</td><td ${td}>${tot.mail}</td><td ${td}>${tot.whatsapp}</td><td ${td}>${tot.llamada}</td><td ${td}></td></tr>
</table>
<p style="font-size:14px;margin:16px 0">Respuestas recibidas: <b>${respuestas}</b> · Búsquedas de clientes: <b>${busquedas}</b> · Contactos nuevos: <b>${nuevos}</b></p>
<p><a href="${base}/envios" style="display:inline-block;background:#1C66E4;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">Ver a quién le escribió cada uno</a></p>
</div>`;
  return { subject, text, html, filas: filas.map((f) => ({ name: primerNombre(f.name), mail: f.mail, whatsapp: f.whatsapp, llamada: f.llamada })) };
}

/** El buzón del administrador (el remitente con su email), si tiene Gmail conectado. */
async function buzonAdmin() {
  const emails = adminEmails();
  const s = await db.sender.findFirst({ where: { email: { in: emails, mode: "insensitive" } } });
  return s && senderConnected(s) ? s : null;
}

/** Manda el resumen al administrador desde su propio Gmail. Devuelve a quién o por qué no salió. */
export async function mandarResumen(now = new Date()): Promise<{ ok: true; para: string } | { ok: false; error: string }> {
  const s = await buzonAdmin();
  if (!s) return { ok: false, error: "Tu Gmail no está conectado en Remitentes: conectalo para recibir el resumen." };
  const r = await armarResumen(now);
  const para = adminEmails().join(", ");
  await sendRawEmail({ mailbox: mailboxFor(s), to: para, subject: r.subject, text: r.text, html: r.html, messageId: newMessageId(s.email) });
  return { ok: true, para };
}

/** Desde las 19 h de cada día hábil, una sola vez por día, si el administrador lo encendió. */
export async function resumenSiHaceFalta(now = new Date()) {
  const { fecha, hora, dia } = ahoraAR(now);
  if (hora < 19 || dia === 0 || dia === 6) return null;
  // marca el día antes de mandar: si dos pasadas llegan juntas, sale uno solo
  const r = await db.setting.updateMany({ where: { id: "app", resumenOn: true, resumenUltimo: { not: fecha } }, data: { resumenUltimo: fecha } });
  if (!r.count) return null;
  return mandarResumen(now);
}
