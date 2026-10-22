import Link from "next/link";
import { db } from "@/lib/db";
import { mailboxHealth } from "@/lib/health";
import { PageHeader, Dot, Avatar, ProgressBar, Pill, Empty } from "@/components/ui";
import { checkConnections } from "../actions";

export const metadata = { title: "Buzones" };

export default async function Mailboxes() {
  const boxes = await mailboxHealth();
  const day = new Date(Date.now() - 86400_000);
  const week = new Date(Date.now() - 7 * 86400_000);
  const [sent24, replies7, scheduled] = await Promise.all([
    db.message.groupBy({ by: ["fromEmail"], where: { sentAt: { gte: day }, error: null }, _count: true }),
    db.reply.groupBy({ by: ["mailbox"], where: { receivedAt: { gte: week } }, _count: true }),
    db.enrollment.findMany({
      where: { status: "ACTIVE", sequence: { status: { not: "ARCHIVED" } } },
      select: { sequence: { select: { senderId: true } } },
    }),
  ]);
  const queued = new Map<string, number>();
  for (const e of scheduled) {
    const key = e.sequence.senderId;
    if (key) queued.set(key, (queued.get(key) ?? 0) + 1);
  }
  const by = <T extends { _count: number }>(rows: T[], f: (r: T) => string) => new Map(rows.map((r) => [f(r).toLowerCase(), r._count]));
  const sentMap = by(sent24, (r) => r.fromEmail);
  const repliesMap = by(replies7, (r) => r.mailbox);

  return (
    <>
      <PageHeader title="Buzones" sub="Salida y entrada de cada cuenta de Gmail: lo que se va a enviar, lo enviado y las respuestas.">
        <form action={checkConnections}><button className="btn-ghost" title="No envía nada">Comprobar conexiones</button></form>
        <Link href="/remitentes" className="btn">Gestionar remitentes</Link>
      </PageHeader>
      {boxes.length === 0 ? (
        <div className="card"><Empty title="No hay buzones">Añade un remitente y conéctalo con Google.</Empty></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {boxes.map(({ box, today, checks, level }, i) => {
            const problem = checks.find((c) => c.level === level && (level === "bad" || level === "warn"));
            return (
              <Link
                key={box.key}
                href={`/buzones/${box.key}`}
                className="card appear group flex flex-col gap-4 p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={box.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{box.name}</div>
                    <div className="truncate text-[13px] text-muted">{box.email}</div>
                  </div>
                  <Dot level={level} pulse={level === "ok"} />
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-xs text-muted">
                    <span>Enviados hoy</span>
                    <span className="tabular-nums">{today} / {box.limit}</span>
                  </div>
                  <ProgressBar value={(today / Math.max(1, box.limit)) * 100} tone={today >= box.limit ? "warn" : "brand"} className="w-full" />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Salida", queued.get(box.key) ?? 0],
                    ["Enviados 24 h", sentMap.get(box.email) ?? 0],
                    ["Respuestas 7 d", repliesMap.get(box.email) ?? 0],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-black/[.03] py-2">
                      <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                      <dt className="text-[11px] text-muted">{k}</dt>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap items-center gap-2">
                  {box.connected ? <Pill tone="ok">{box.viaGoogle ? "Conectado con Google" : "Conectado"}</Pill> : <Pill tone="bad">Sin conectar</Pill>}
                  {problem && <span className="truncate text-xs text-[#B25000]">{problem.title}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
