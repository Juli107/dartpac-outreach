import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { signId } from "./tokens";

import { decryptSecret } from "./crypto";
import { withSignature } from "./signature";

type Transport = ReturnType<typeof nodemailer.createTransport>;
const transports = new Map<string, Transport>();

/** Datos de un buzón de envío: el de un comercial o, si la secuencia no tiene, el general del .env. */
export type Mailbox = { from: string; user: string; pass: string };

export function mailboxFor(sender?: { name: string; email: string; appPassword: string | null } | null): Mailbox {
  if (sender?.appPassword) {
    const company = process.env.COMPANY_NAME ?? "Plupack Embalajes";
    return { from: `"${sender.name} | ${company}" <${sender.email}>`, user: sender.email, pass: decryptSecret(sender.appPassword) };
  }
  if (sender) throw new Error(`${sender.name} no tiene contraseña de aplicación guardada`);
  return { from: process.env.MAIL_FROM ?? process.env.SMTP_USER ?? "", user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASS ?? "" };
}

function getTransport(box: Mailbox) {
  let t = transports.get(box.user);
  if (!t) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: box.user, pass: box.pass },
    });
    transports.set(box.user, t);
  }
  return t;
}

/** Comprueba usuario y contraseña contra el servidor SMTP sin enviar nada. */
export async function verifyMailbox(box: Mailbox) {
  transports.delete(box.user);
  await getTransport(box).verify();
}

export function newMessageId(fromAddress: string) {
  const domain = fromAddress.split("@")[1] || "plupackembalajes.com";
  return `<${randomUUID()}@${domain}>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Convierte el texto plano del paso en HTML sencillo, con píxel de apertura y enlace de baja. */
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
      `<p style="margin:24px 0 0;font-size:11px;color:#8792A2">Si no quieres recibir más correos, <a href="${unsubscribe}" style="color:#8792A2">date de baja aquí</a>.</p>` +
      `<img src="${base}/api/t/${opts.trackingId}" width="1" height="1" alt="" style="display:block"></div>`,
    unsubscribe,
  };
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
}) {
  const { html, unsubscribe } = buildHtml(args.body, { ...args, signatureHtml: args.signature?.html });
  await getTransport(args.mailbox).sendMail({
    from: args.mailbox.from,
    to: args.to,
    subject: args.subject,
    text: withSignature(args.body, args.signature?.text ?? ""),
    html,
    messageId: args.messageId,
    inReplyTo: args.inReplyTo,
    references: args.inReplyTo,
    headers: { "List-Unsubscribe": `<${unsubscribe}>` },
  });
}
