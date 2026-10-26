import { resolveTxt } from "node:dns/promises";
import { db } from "./db";
import { sentToday } from "./quota";
import { isInWindow, nextSendTime, windowFor } from "./schedule";
import { unknownVariables } from "./template";
import { mailboxFor, senderConnected, verifyMailbox } from "./mailer";
import { lastRun } from "./settings";

/**
 * Estado de envío: responde "¿está todo bien para que salgan los correos?" sin enviar nada.
 * Mira la conexión de cada buzón, sus errores recientes, cupos, horario, el programador y el DNS del dominio.
 */
export type Level = "ok" | "info" | "warn" | "bad" | "off";
export type Check = { level: Level; title: string; detail?: string };

const ORDER: Level[] = ["off", "ok", "info", "warn", "bad"];
export function worst(checks: Check[]): Level {
  return checks.reduce<Level>((w, c) => (ORDER.indexOf(c.level) > ORDER.indexOf(w) ? c.level : w), "ok");
}

const DAY = 86400_000;
/** El programador corre cada 10 minutos; tras 30 sin noticias algo lo frenó. */
const CRON_STALE_MS = 30 * 60_000;

export type MailboxInfo = {
  key: string;
  name: string;
  email: string;
  limit: number;
  connected: boolean;
  viaGoogle: boolean;
  lastCheckAt: Date | null;
  lastCheckError: string | null;
};

/** Un buzón por remitente (la clave es el id del remitente). */
export async function mailboxes(): Promise<MailboxInfo[]> {
  const senders = await db.sender.findMany({ orderBy: { name: "asc" } });
  const list: MailboxInfo[] = [];
  for (const s of senders) {
    list.push({
      key: s.id,
      name: s.name,
      email: s.email.toLowerCase(),
      limit: s.dailyLimit,
      connected: senderConnected(s),
      viaGoogle: !!s.googleRefreshToken,
      lastCheckAt: s.lastCheckAt,
      lastCheckError: s.lastCheckError,
    });
  }
  return list;
}

/** Fallos de envío de las últimas 24 h por buzón (sin contar direcciones inexistentes, que son del contacto). */
async function recentFailures(now: Date) {
  const rows = await db.message.findMany({
    where: { sentAt: { gte: new Date(now.getTime() - DAY) }, error: { not: null } },
    select: { fromEmail: true, error: true, sentAt: true, enrollment: { select: { sequenceId: true } } },
    orderBy: { sentAt: "desc" },
  });
  const byBox = new Map<string, { count: number; last: string }>();
  const bySequence = new Map<string, number>();
  for (const r of rows) {
    const box = r.fromEmail.toLowerCase();
    const cur = byBox.get(box);
    byBox.set(box, { count: (cur?.count ?? 0) + 1, last: cur?.last ?? r.error ?? "" });
    bySequence.set(r.enrollment.sequenceId, (bySequence.get(r.enrollment.sequenceId) ?? 0) + 1);
  }
  return { byBox, bySequence };
}

export function mailboxChecks(box: MailboxInfo, today: number, failures?: { count: number; last: string }): Check[] {
  const checks: Check[] = [];
  if (!box.connected) {
    checks.push({
      level: "bad",
      title: "Sin conectar",
      detail: "Conéctalo con Google en Remitentes.",
    });
    return checks;
  }
  if (box.lastCheckError) checks.push({ level: "bad", title: "La última comprobación falló", detail: box.lastCheckError });
  else if (box.lastCheckAt) checks.push({ level: "ok", title: "Conexión comprobada", detail: `Gmail aceptó las credenciales.` });
  else checks.push({ level: "info", title: "Conexión sin comprobar", detail: "Pulsa “Comprobar conexiones”: no envía nada." });
  if (failures?.count) checks.push({ level: "bad", title: `${failures.count} envíos fallidos en 24 h`, detail: failures.last });
  if (today >= box.limit) checks.push({ level: "warn", title: "Llegó a su tope de hoy", detail: `${today} de ${box.limit}. Sigue mañana.` });
  return checks;
}

type SequenceForHealth = {
  id: string;
  status: string;
  sendingOn: boolean;
  dailyLimit: number;
  timeZone: string;
  startHour: number;
  endHour: number;
  sendDays: number[];
  senderId: string | null;
  steps: { order: number; type: string; subject: string; body: string; sameThread: boolean; variants?: { subject: string; body: string }[] }[];
};

/** Problemas de la secuencia que impiden (o frenan) sus envíos. */
export function sequenceChecks(
  sq: SequenceForHealth,
  ctx: { now: Date; box?: MailboxInfo; boxToday: number; seqToday: number; waiting: number; failures: number },
): Check[] {
  const checks: Check[] = [];
  if (sq.status === "ARCHIVED") return [{ level: "off", title: "Archivada" }];
  if (!sq.sendingOn) checks.push({ level: "off", title: "Apagada", detail: "No envía hasta que la enciendas." });

  const emails = sq.steps.filter((s) => s.type === "EMAIL");
  if (sq.steps.length === 0) checks.push({ level: "bad", title: "No tiene pasos" });
  for (const s of emails) {
    const texts = [{ subject: s.subject, body: s.body }, ...(s.variants ?? [])];
    const needsSubject = !(s.sameThread && s.order > 1);
    if (texts.some((t) => !t.body.trim() || (needsSubject && !t.subject.trim()))) {
      checks.push({ level: "bad", title: `El paso ${s.order} tiene el asunto o el mensaje vacío` });
    }
    const unknown = unknownVariables(texts.map((t) => t.subject + t.body).join(" "));
    if (unknown.length) checks.push({ level: "warn", title: `Variables desconocidas en el paso ${s.order}`, detail: unknown.map((v) => `{{${v}}}`).join(", ") });
  }

  if (!ctx.box) checks.push({ level: "bad", title: "Sin remitente", detail: "Elige quién envía en la pestaña Ajustes." });
  else if (!ctx.box.connected) checks.push({ level: "bad", title: `${ctx.box.name} no está conectado`, detail: ctx.box.email });
  else if (ctx.box.lastCheckError) checks.push({ level: "bad", title: `${ctx.box.name}: la conexión falló`, detail: ctx.box.lastCheckError });

  if (ctx.failures) checks.push({ level: "bad", title: `${ctx.failures} envíos fallidos en 24 h`, detail: "Míralos en la pestaña Registro." });
  if (ctx.waiting === 0) checks.push({ level: "warn", title: "Nadie esperando envío", detail: "Añade contactos en la pestaña Personas." });

  if (sq.sendingOn) {
    const w = windowFor(sq);
    if (!isInWindow(ctx.now, w)) {
      const next = nextSendTime(ctx.now, 0, w);
      checks.push({ level: "info", title: "Fuera de horario", detail: `Vuelve a enviar ${next.toLocaleString("es-AR", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: sq.timeZone })}.` });
    }
    if (ctx.seqToday >= sq.dailyLimit) checks.push({ level: "warn", title: "Tope diario de la secuencia alcanzado", detail: `${ctx.seqToday} de ${sq.dailyLimit}. Sigue mañana.` });
    if (ctx.box && ctx.boxToday >= ctx.box.limit) checks.push({ level: "warn", title: `${ctx.box.name} llegó a su tope de hoy` });
  }
  return checks;
}

/** Texto corto del estado de una secuencia para la lista. */
export function sequenceVerdict(checks: Check[]): { level: Level; text: string } {
  const level = worst(checks);
  if (checks.some((c) => c.level === "off")) return { level: "off", text: checks.find((c) => c.level === "off")!.title };
  const first = checks.find((c) => c.level === level && level !== "ok");
  if (!first) return { level: "ok", text: "Enviando" };
  return { level, text: first.title };
}

export async function sequenceHealthMap(sequences: SequenceForHealth[], now = new Date()) {
  const [boxes, today, failures, waiting] = await Promise.all([
    mailboxes(),
    sentToday(now),
    recentFailures(now),
    db.enrollment.groupBy({ by: ["sequenceId"], where: { status: "ACTIVE", sequenceId: { in: sequences.map((s) => s.id) } }, _count: true }),
  ]);
  const waitingBy = new Map(waiting.map((w) => [w.sequenceId, w._count]));
  const map = new Map<string, Check[]>();
  for (const sq of sequences) {
    const box = boxes.find((b) => b.key === sq.senderId);
    map.set(
      sq.id,
      sequenceChecks(sq, {
        now,
        box,
        boxToday: box ? today.byMailbox.get(box.email) ?? 0 : 0,
        seqToday: today.bySequence.get(sq.id) ?? 0,
        waiting: waitingBy.get(sq.id) ?? 0,
        failures: failures.bySequence.get(sq.id) ?? 0,
      }),
    );
  }
  return map;
}

export async function mailboxHealth(now = new Date()) {
  const [boxes, today, failures] = await Promise.all([mailboxes(), sentToday(now), recentFailures(now)]);
  return boxes.map((box) => {
    const sent = today.byMailbox.get(box.email) ?? 0;
    const checks = mailboxChecks(box, sent, failures.byBox.get(box.email));
    return { box, today: sent, checks, level: worst(checks) };
  });
}

/** El programador corre cada 10 min de lunes a viernes, de 11 a 22 h UTC (8–19 h en Argentina). */
export function cronShouldRun(now: Date) {
  const d = now.getUTCDay();
  const h = now.getUTCHours();
  return d >= 1 && d <= 5 && h >= 11 && h < 22;
}

/** El programador (la app misma mientras alguien la tenga abierta, GitHub y, si está, cron-job.org) y la última lectura de buzones. */
export async function schedulerChecks(now = new Date()): Promise<Check[]> {
  const { at, report } = await lastRun();
  const checks: Check[] = [];
  if (!at) checks.push({ level: "bad", title: "El programador nunca se ejecutó", detail: "Arranca solo apenas alguien abre Outreach en horario de envíos (lunes a viernes, de 8 a 19)." });
  else if (now.getTime() - at.getTime() > CRON_STALE_MS && cronShouldRun(now)) {
    checks.push({
      level: "bad",
      title: "El programador está parado",
      detail: `Última pasada ${at.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}. Con Outreach abierto se pone al día solo: en un minuto se actualiza.`,
    });
  } else {
    checks.push({ level: "ok", title: "Programador funcionando", detail: `Última pasada hace ${Math.max(1, Math.round((now.getTime() - at.getTime()) / 60_000))} min.` });
  }
  const inbox = report?.inbox;
  if (inbox && typeof inbox === "object") {
    if ("error" in inbox) checks.push({ level: "warn", title: "No se pudo leer la bandeja de entrada", detail: inbox.error });
    else if (inbox.errors?.length) checks.push({ level: "warn", title: "Algún buzón no se pudo leer", detail: inbox.errors.join(" · ") });
  }
  return checks;
}

const dnsCache = new Map<string, { at: number; checks: Check[] }>();

async function txt(name: string) {
  try {
    return (await resolveTxt(name)).map((r) => r.join(""));
  } catch {
    return null;
  }
}

/** SPF, DKIM y DMARC del dominio: sin ellos Gmail y Outlook mandan los correos a spam. */
export async function domainChecks(domain = (process.env.GOOGLE_ALLOWED_DOMAIN ?? "plupackembalajes.com").toLowerCase()): Promise<Check[]> {
  const cached = dnsCache.get(domain);
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.checks;
  const [root, dmarc, dkim] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`), txt(`google._domainkey.${domain}`)]);
  if (root === null && dmarc === null && dkim === null) {
    return [{ level: "info", title: "No se pudo consultar el DNS", detail: "Se reintenta en la próxima carga." }];
  }
  const spf = root?.find((r) => r.toLowerCase().startsWith("v=spf1"));
  const checks: Check[] = [
    !spf
      ? { level: "bad", title: "Falta SPF", detail: `Añade en el DNS de ${domain}: v=spf1 include:_spf.google.com ~all` }
      : !/_spf\.google\.com/i.test(spf)
        ? { level: "warn", title: "El SPF no incluye a Google", detail: spf }
        : { level: "ok", title: "SPF correcto", detail: spf },
    dkim?.some((r) => /v=DKIM1/i.test(r))
      ? { level: "ok", title: "DKIM activo" }
      : { level: "warn", title: "DKIM sin activar", detail: "Actívalo en Google Admin › Gmail › Autenticar correo." },
    dmarc?.some((r) => /v=DMARC1/i.test(r))
      ? { level: "ok", title: "DMARC configurado", detail: dmarc.find((r) => /v=DMARC1/i.test(r)) }
      : { level: "warn", title: "Falta DMARC", detail: `Añade un TXT en _dmarc.${domain}: v=DMARC1; p=none` },
  ];
  dnsCache.set(domain, { at: Date.now(), checks });
  return checks;
}

/** Comprueba por SMTP las credenciales de todos los buzones conectados. No envía ningún correo. */
export async function checkAllConnections() {
  const senders = await db.sender.findMany();
  await Promise.all(
    senders.filter(senderConnected).map(async (s) => {
      let error: string | null = null;
      try {
        await verifyMailbox(mailboxFor(s));
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      await db.sender.update({ where: { id: s.id }, data: { lastCheckAt: new Date(), lastCheckError: error } });
    }),
  );
}

/**
 * Veredicto general para el Panel y la barra lateral: "off" si no hay ninguna secuencia encendida;
 * si no, lo peor entre el programador, las secuencias encendidas y sus buzones.
 */
export async function overallHealth(now = new Date()) {
  const sequences = await db.sequence.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    include: { steps: { include: { variants: true } } },
  });
  const [bySequence, boxes, scheduler] = await Promise.all([sequenceHealthMap(sequences, now), mailboxHealth(now), schedulerChecks(now)]);
  const on = sequences.filter((s) => s.sendingOn);
  const usedBoxes = new Set(on.map((s) => s.senderId));
  const relevant = [
    ...scheduler,
    ...on.flatMap((s) => bySequence.get(s.id) ?? []),
    ...boxes.filter((b) => usedBoxes.has(b.box.key)).flatMap((b) => b.checks),
  ];
  const level: Level = on.length === 0 ? "off" : worst(relevant.filter((c) => c.level !== "info"));
  return { level, sequences, on, bySequence, boxes, scheduler };
}
