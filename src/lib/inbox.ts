import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db } from "./db";
import { stripQuoted } from "./strip";
import { imapAuth, mailboxFor, type Mailbox } from "./mailer";

/**
 * Lee por IMAP el buzón general y el de cada comercial conectado (Google o contraseña), y guarda
 * como respuesta cualquier correo de un contacto conocido. Al responder, el contacto sale
 * de todas sus secuencias activas.
 */
export async function syncInbox(sinceDays = 3) {
  const boxes: Mailbox[] = [];
  if (process.env.IMAP_USER && process.env.IMAP_PASS) boxes.push({ from: "", user: process.env.IMAP_USER, pass: process.env.IMAP_PASS });
  const senders = await db.sender.findMany({ where: { OR: [{ appPassword: { not: null } }, { googleRefreshToken: { not: null } }] } });
  for (const s of senders) {
    if (!boxes.some((b) => b.user === s.email)) boxes.push(mailboxFor(s));
  }
  let imported = 0;
  const errors: string[] = [];
  for (const box of boxes) {
    try {
      imported += await syncMailbox(box, sinceDays);
    } catch (e) {
      errors.push(`${box.user}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { imported, disabled: boxes.length === 0, errors };
}

async function syncMailbox(box: Mailbox, sinceDays: number) {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: await imapAuth(box),
    logger: false,
  });
  await client.connect();
  let imported = 0;
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - sinceDays * 86400_000);
    for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
      const env = msg.envelope;
      const from = env?.from?.[0]?.address?.toLowerCase();
      const messageId = env?.messageId;
      if (!from || !messageId) continue;
      const contact = await db.contact.findUnique({ where: { email: from } });
      if (!contact) continue;
      const exists = await db.reply.findUnique({ where: { messageId } });
      if (exists) continue;

      const parsed = msg.source ? await simpleParser(msg.source) : null;
      const body = stripQuoted(parsed?.text ?? "").slice(0, 5000);

      await db.reply.create({
        data: {
          contactId: contact.id,
          messageId,
          inReplyTo: env.inReplyTo ?? null,
          subject: env.subject ?? "(sin asunto)",
          body,
          receivedAt: env.date ?? new Date(),
        },
      });
      await db.enrollment.updateMany({
        where: { contactId: contact.id, status: "ACTIVE" },
        data: { status: "REPLIED", nextRunAt: null },
      });
      imported++;
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return imported;
}
