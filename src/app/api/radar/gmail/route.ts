import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { mailboxFor, newMessageId, sendRawEmail, senderConnected } from "@/lib/mailer";
import { camposContacto, verificar } from "@/lib/verifier";
import { quienSoy } from "@/lib/yo";
import { signId } from "@/lib/tokens";
import { fullName } from "@/lib/labels";
import { datosContacto } from "@/lib/radar/outreach";
import type { RadarData } from "@/lib/radar/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lo que el Radar hacía con el conector de Gmail, ahora con los buzones de Outreach:
 * - send_message: manda desde el Gmail del remitente elegido (Ajustes del Radar o quien entró con Google).
 * - search_threads / get_thread: busca las respuestas y los rebotes que la Bandeja ya leyó de los buzones.
 */
const Body = z.object({ tool: z.enum(["send_message", "search_threads", "get_thread"]), input: z.record(z.unknown()), desde: z.string().nullish() });
const err = (error: string, detail: string, status = 400) => NextResponse.json({ error, detail }, { status });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("invalid_argument", "Pedido inválido");
  const { tool, input, desde } = parsed.data;
  if (tool === "send_message") return enviar(input, desde ?? null);
  if (tool === "search_threads") return buscar(String(input.query ?? ""), Number(input.pageSize ?? 50));
  return hilo(String(input.threadId ?? ""));
}

async function prospectoPorEmail(email: string) {
  const rows = await db.$queryRaw<{ id: string; data: RadarData }[]>`
    SELECT id, data FROM "RadarDoc" WHERE col = 'prospectos' AND deleted = false AND lower(data->>'email') = ${email} LIMIT 1`;
  return rows[0] ?? null;
}

async function enviar(input: Record<string, unknown>, desde: string | null) {
  const to = (Array.isArray(input.to) ? (input.to as unknown[]) : [input.to]).map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean)[0];
  const subject = String(input.subject ?? "").slice(0, 300);
  const text = String(input.body ?? "");
  if (!to || !subject || !text) return err("invalid_argument", "Falta el destinatario, el asunto o el texto.");
  const vfy = await verificar(to);
  if (vfy.estado === "invalido" || vfy.estado === "corregible") return err("vfy_bloqueado", vfy.estado === "corregible" ? `¿Quisiste decir ${vfy.sugerencia}?` : `${vfy.motivos[0]?.t ?? "Email inválido"}.`, 422);

  const senderId = desde || (await quienSoy())?.senderId;
  if (!senderId) return err("server_not_connected", "Elegí desde qué buzón mandás en Ajustes del Radar.", 409);
  const sender = await db.sender.findUnique({ where: { id: senderId } });
  if (!sender || !senderConnected(sender)) return err("server_not_connected", "Ese buzón no está conectado: conectalo con Google en Remitentes.", 409);

  // el destinatario queda como contacto: así la Bandeja captura su respuesta y la ficha del Radar se entera
  const p = await prospectoPorEmail(to);
  let contact = await db.contact.findUnique({ where: { email: to } });
  if (!contact && p) contact = await db.contact.findFirst({ where: { radarId: p.id } });
  const vfyData = { email: to, ...camposContacto(vfy) };
  if (contact) {
    if (contact.unsubscribed) return err("vfy_bloqueado", "Esa persona pidió no recibir más correos.", 422);
    contact = await db.contact.update({ where: { id: contact.id }, data: { ...(contact.email ? {} : vfyData), ...(p && !contact.radarId ? { radarId: p.id } : {}) } });
  } else {
    contact = await db.contact.create({ data: { ...(p ? datosContacto(p.id, p.data) : {}), ...vfyData, tags: ["radar"] } });
  }

  const attachments = (Array.isArray(input.attachments) ? (input.attachments as Record<string, unknown>[]) : []).slice(0, 3).flatMap((a) => {
    const content = Buffer.from(String(a.content ?? ""), "base64");
    if (!content.length || content.length > 3_000_000) return [];
    const filename = String(a.filename ?? "adjunto").slice(0, 120);
    return [{ filename, content, contentType: String(a.mimeType ?? "application/octet-stream"), ...(a.inline ? { cid: filename } : {}) }];
  });
  const base = process.env.APP_URL ?? "";
  const messageId = newMessageId(sender.email);
  try {
    await sendRawEmail({
      mailbox: mailboxFor(sender),
      to,
      subject,
      text,
      html: typeof input.htmlBody === "string" ? input.htmlBody : undefined,
      messageId,
      attachments,
      unsubscribe: base ? `${base}/baja/${contact.id}/${signId(contact.id)}` : undefined,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/invalid_grant|auth|credentials|Username and Password/i.test(m)) return err("needs_reauth", m, 409);
    return err("upstream_error", m, 502);
  }
  return NextResponse.json({ payload: { id: messageId, from: sender.email } });
}

function terminos(q: string) {
  const grupo = /from:\(([^)]*)\)/i.exec(q)?.[1] ?? /from:(\S+)/i.exec(q)?.[1] ?? "";
  const terms = grupo.split(/\s+OR\s+|\s+/i).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const dias = Number(/newer_than:(\d+)d/i.exec(q)?.[1] ?? 60) || 60;
  return { terms, dias };
}

async function buscar(q: string, pageSize: number) {
  const { terms, dias } = terminos(q);
  const take = Math.min(100, Math.max(1, pageSize || 50));
  if (terms.some((t) => t === "mailer-daemon" || t === "postmaster")) {
    // rebotes: los contactos que la Bandeja marcó como rebotados
    const rows = await db.contact.findMany({ where: { bounced: true, email: { not: null } }, orderBy: { createdAt: "desc" }, take });
    return NextResponse.json({
      payload: {
        threads: rows.map((c) => ({
          id: `b:${c.id}`,
          messages: [{ id: `b:${c.id}`, sender: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)", snippet: `No se pudo entregar el mensaje a ${c.email}`, date: c.createdAt.toISOString() }],
        })),
      },
    });
  }
  const emails = terms.filter((t) => t.includes("@"));
  const dominios = terms.filter((t) => !t.includes("@") && t.includes("."));
  if (!emails.length && !dominios.length) return NextResponse.json({ payload: { threads: [] } });
  const replies = await db.reply.findMany({
    where: {
      receivedAt: { gte: new Date(Date.now() - dias * 86400_000) },
      contact: { OR: [...(emails.length ? [{ email: { in: emails } }] : []), ...dominios.map((d) => ({ email: { endsWith: `@${d}` } }))] },
    },
    include: { contact: true },
    orderBy: { receivedAt: "desc" },
    take,
  });
  return NextResponse.json({
    payload: {
      threads: replies.map((r) => ({
        id: `r:${r.id}`,
        messages: [{ id: r.id, sender: `${fullName(r.contact)} <${r.contact.email}>`, subject: r.subject, snippet: r.body.slice(0, 180), date: r.receivedAt.toISOString(), internalDate: r.receivedAt.getTime() }],
      })),
    },
  });
}

async function hilo(threadId: string) {
  if (threadId.startsWith("b:")) {
    const c = await db.contact.findUnique({ where: { id: threadId.slice(2) } });
    return NextResponse.json({ payload: { messages: c ? [{ id: threadId, sender: "mailer-daemon@googlemail.com", plaintextBody: `No se pudo entregar el mensaje a ${c.email}: la dirección no existe o no recibe correos.` }] : [] } });
  }
  const r = threadId.startsWith("r:") ? await db.reply.findUnique({ where: { id: threadId.slice(2) }, include: { contact: true } }) : null;
  return NextResponse.json({
    payload: { messages: r ? [{ id: r.id, sender: `${fullName(r.contact)} <${r.contact.email}>`, subject: r.subject, plaintextBody: r.body, date: r.receivedAt.toISOString() }] : [] },
  });
}
