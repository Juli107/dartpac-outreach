import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { signId } from "./tokens";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

function domain() {
  return (process.env.SMTP_USER ?? "dartpac.local").split("@")[1] ?? "dartpac.local";
}

export function newMessageId() {
  return `<${randomUUID()}@${domain()}>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Convierte el texto plano del paso en HTML sencillo, con píxel de apertura y enlace de baja. */
export function buildHtml(body: string, opts: { trackingId: string; contactId: string }) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const unsubscribe = `${base}/baja/${opts.contactId}/${signId(opts.contactId)}`;
  return {
    html:
      `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#14213D">${paragraphs}` +
      `<p style="margin:24px 0 0;font-size:11px;color:#8792A2">Si no quieres recibir más correos, <a href="${unsubscribe}" style="color:#8792A2">date de baja aquí</a>.</p>` +
      `<img src="${base}/api/t/${opts.trackingId}" width="1" height="1" alt="" style="display:block"></div>`,
    unsubscribe,
  };
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
  messageId: string;
  trackingId: string;
  contactId: string;
  inReplyTo?: string;
}) {
  const { html, unsubscribe } = buildHtml(args.body, args);
  await getTransport().sendMail({
    from: process.env.MAIL_FROM,
    to: args.to,
    subject: args.subject,
    text: args.body,
    html,
    messageId: args.messageId,
    inReplyTo: args.inReplyTo,
    references: args.inReplyTo,
    headers: { "List-Unsubscribe": `<${unsubscribe}>` },
  });
}
