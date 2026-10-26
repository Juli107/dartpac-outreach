import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { signId } from "./tokens";

import { decryptSecret } from "./crypto";
import { withSignature } from "./signature";
import { accessTokenFor } from "./google";

type Transport = ReturnType<typeof nodemailer.createTransport>;
const transports = new Map<string, Transport>();

/**
 * Datos de un buzón de envío: el de un comercial o, si la secuencia no tiene, el general del .env.
 * Un comercial conectado con Google lleva refreshToken; si no, su contraseña de aplicación.
 */
export type Mailbox = { from: string; user: string; pass?: string; refreshToken?: string };

type SenderCredentials = { name: string; email: string; appPassword: string | null; googleRefreshToken?: string | null };

export function senderConnected(sender: { appPassword: string | null; googleRefreshToken?: string | null }) {
  return !!(sender.googleRefreshToken || sender.appPassword);
}

/** Buzón de un remitente. No hay buzón general: cada secuencia envía desde el Gmail de un remitente. */
export function mailboxFor(sender?: SenderCredentials | null): Mailbox {
  if (!sender) throw new Error("La secuencia no tiene remitente: elige quién envía en Ajustes");
  const company = process.env.COMPANY_NAME ?? "Plupack Embalajes";
  const from = `"${sender.name} | ${company}" <${sender.email}>`;
  if (sender.googleRefreshToken) return { from, user: sender.email, refreshToken: decryptSecret(sender.googleRefreshToken) };
  if (sender.appPassword) return { from, user: sender.email, pass: decryptSecret(sender.appPassword) };
  throw new Error(`${sender.name} no tiene su Gmail conectado`);
}

function getTransport(box: Mailbox) {
  const key = `${box.user}:${box.refreshToken ? "google" : "pass"}`;
  let t = transports.get(key);
  if (!t) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    t = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port,
      secure: port === 465,
      // Con OAuth2 nodemailer renueva solo el token de acceso a partir del refresh token.
      auth: box.refreshToken
        ? {
            type: "OAuth2",
            user: box.user,
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            refreshToken: box.refreshToken,
          }
        : { user: box.user, pass: box.pass },
    });
    transports.set(key, t);
  }
  return t;
}

/** Credenciales IMAP del buzón: token de acceso de Google o contraseña. */
export async function imapAuth(box: Mailbox) {
  return box.refreshToken ? { user: box.user, accessToken: await accessTokenFor(box.refreshToken) } : { user: box.user, pass: box.pass ?? "" };
}

/** Comprueba las credenciales contra el servidor SMTP sin enviar nada. */
export async function verifyMailbox(box: Mailbox) {
  transports.delete(`${box.user}:${box.refreshToken ? "google" : "pass"}`);
  await getTransport(box).verify();
}

export function newMessageId(fromAddress: string) {
  const domain = fromAddress.split("@")[1] || "plupackembalajes.com";
  return `<${randomUUID()}@${domain}>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Convierte el texto plano del paso en HTML sencillo, con píxel de apertura. Sin pie de baja visible (así lo pidió el
 * equipo): la baja viaja en la cabecera List-Unsubscribe, que Gmail muestra como «Anular suscripción».
 */
export function buildHtml(body: string, opts: { trackingId: string; contactId: string; signatureHtml?: string }) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const unsubscribe = `${base}/baja/${opts.contactId}/${signId(opts.contactId)}`;
  return {
    html:
      `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#14213D">${paragraphs}${opts.signatureHtml ?? ""}` +
      `<img src="${base}/api/t/${opts.trackingId}" width="1" height="1" alt="" style="display:block"></div>`,
    unsubscribe,
  };
}

/**
 * Envío suelto (desde el Radar): el texto y el HTML ya vienen armados, con su firma y su pie de baja.
 * Admite adjuntos en línea (la tarjeta de presentación, con cid).
 */
export async function sendRawEmail(args: {
  mailbox: Mailbox;
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId: string;
  attachments?: { filename: string; content: Buffer; contentType: string; cid?: string }[];
  unsubscribe?: string;
}) {
  await getTransport(args.mailbox).sendMail({
    from: args.mailbox.from,
    to: args.to,
    subject: args.subject,
    text: args.text,
    ...(args.html ? { html: args.html } : {}),
    messageId: args.messageId,
    attachments: args.attachments,
    ...(args.unsubscribe ? { headers: { "List-Unsubscribe": `<${args.unsubscribe}>` } } : {}),
  });
}

export async function sendEmail(args: {
  mailbox: Mailbox;
  to: string;
  subject: string;
  body: string;
  messageId: string;
  trackingId: string;
  contactId: string;
  inReplyTo?: string;
  signature?: { text: string; html: string };
  /** Solo texto: sin HTML ni píxel de apertura. */
  plainText?: boolean;
}) {
  const { html, unsubscribe } = buildHtml(args.body, { ...args, signatureHtml: args.signature?.html });
  const text = withSignature(args.body, args.signature?.text ?? "");
  await getTransport(args.mailbox).sendMail({
    from: args.mailbox.from,
    to: args.to,
    subject: args.subject,
    text,
    ...(args.plainText ? {} : { html }),
    messageId: args.messageId,
    inReplyTo: args.inReplyTo,
    references: args.inReplyTo,
    headers: { "List-Unsubscribe": `<${unsubscribe}>` },
  });
}
