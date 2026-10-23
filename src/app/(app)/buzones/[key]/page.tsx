import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { mailboxHealth } from "@/lib/health";
import { REPLY_LABEL, formatDate, fullName, relativeTime } from "@/lib/labels";
import { PageHeader, Segmented, CheckList, Avatar, Pill, StatusPill, Empty, ProgressBar } from "@/components/ui";
import { checkConnections } from "../../actions";

export const metadata = { title: "Buzón" };

const TABS = [
  ["salida", "Salida"],
  ["enviados", "Enviados"],
  ["entrada", "Entrada"],
] as const;

export default async function Mailbox({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const item = (await mailboxHealth()).find((b) => b.box.key === key);
  if (!item) notFound();
  const { box, today, checks } = item;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "salida";
  const senderFilter = { senderId: key };

  const [queuedCount, sentCount, inCount] = await Promise.all([
    db.enrollment.count({ where: { status: "ACTIVE", sequence: { ...senderFilter, status: { not: "ARCHIVED" } } } }),
    db.message.count({ where: { fromEmail: box.email } }),
    db.reply.count({ where: { mailbox: box.email } }),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: "/buzones", label: "Buzones" }}
        title={<span className="flex items-center gap-3"><Avatar name={box.name} size={40} />{box.name}</span>}
        sub={box.email}
      >
        <form action={checkConnections}><button className="btn-ghost" title="No envía nada">Comprobar conexión</button></form>
        <Link href={`/remitentes?editar=${key}`} className="btn-ghost">Editar remitente</Link>
      </PageHeader>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Segmented
            label="Buzón"
            active={tab}
            items={TABS.map(([k, label]) => ({ key: k, label, href: `/buzones/${key}?tab=${k}`, count: k === "salida" ? queuedCount : k === "enviados" ? sentCount : inCount }))}
          />
          {tab === "salida" && <Outbox senderFilter={senderFilter} />}
          {tab === "enviados" && <Sent email={box.email} />}
          {tab === "entrada" && <Inbox email={box.email} />}
        </div>
        <aside className="flex flex-col gap-4">
          <section className="card appear p-5">
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="font-medium">Enviados hoy</span>
              <span className="tabular-nums text-muted">{today} / {box.limit}</span>
            </div>
            <ProgressBar value={(today / Math.max(1, box.limit)) * 100} tone={today >= box.limit ? "warn" : "brand"} className="w-full" />
            <p className="mt-2 text-xs text-muted">Tope diario de este buzón, sumando todas sus secuencias.</p>
          </section>
          <section className="card appear overflow-hidden">
            <div className="card-title"><h2>Estado</h2></div>
            <CheckList checks={checks} />
          </section>
        </aside>
      </div>
    </>
  );
}

async function Outbox({ senderFilter }: { senderFilter: { senderId: string } }) {
  const rows = await db.enrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { not: null }, sequence: { ...senderFilter, status: { not: "ARCHIVED" } } },
    include: { contact: true, sequence: { select: { id: true, name: true, sendingOn: true, steps: { select: { order: true, type: true, subject: true } } } } },
    orderBy: { nextRunAt: "asc" },
    take: 100,
  });
  return (
    <section className="card appear min-w-0 overflow-hidden">
      {rows.length === 0 ? (
        <Empty title="Nada en la cola">Cuando haya contactos en secuencias de este buzón, aquí verás qué sale y cuándo.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Cuándo</th><th>Para</th><th>Secuencia</th><th>Paso</th></tr></thead>
            <tbody>
              {rows.map((e) => {
                const step = e.sequence.steps.find((s) => s.order === e.nextStep);
                return (
                  <tr key={e.id}>
                    <td>{e.sequence.sendingOn ? formatDate(e.nextRunAt!) : <Pill tone="neutral">Secuencia apagada</Pill>}</td>
                    <td>{fullName(e.contact)}<div className="text-xs text-muted">{e.contact.email}</div></td>
                    <td><Link href={`/secuencias/${e.sequence.id}`} className="hover:text-brand-2">{e.sequence.name}</Link></td>
                    <td className="max-w-[260px] truncate text-muted">{step ? `${e.nextStep} · ${step.type === "EMAIL" ? step.subject || "Re: (mismo hilo)" : "Tarea"}` : "Fin"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

async function Sent({ email }: { email: string }) {
  const rows = await db.message.findMany({
    where: { fromEmail: email },
    include: { enrollment: { include: { contact: true, sequence: { select: { id: true, name: true } } } } },
    orderBy: { sentAt: "desc" },
    take: 100,
  });
  return (
    <section className="card appear min-w-0 overflow-hidden">
      {rows.length === 0 ? (
        <Empty title="Todavía no salió nada de este buzón" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Para</th><th>Asunto</th><th>Secuencia</th><th>Resultado</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="text-muted">{formatDate(m.sentAt)}</td>
                  <td>{fullName(m.enrollment.contact)}<div className="text-xs text-muted">{m.enrollment.contact.email}</div></td>
                  <td className="max-w-[260px] truncate">{m.subject}</td>
                  <td><Link href={`/secuencias/${m.enrollment.sequence.id}?tab=registro`} className="text-muted hover:text-brand-2">{m.enrollment.sequence.name}</Link></td>
                  <td className="max-w-[280px] whitespace-normal">
                    {m.error ? <><Pill tone="bad">Error</Pill> <span className="text-xs text-[#FF9A9A]">{m.error}</span></> : m.openedAt ? <Pill tone="ok">Abierto</Pill> : <Pill tone="info">Enviado</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

async function Inbox({ email }: { email: string }) {
  const rows = await db.reply.findMany({ where: { mailbox: email }, include: { contact: true }, orderBy: { receivedAt: "desc" }, take: 100 });
  return (
    <section className="card appear min-w-0 overflow-hidden">
      {rows.length === 0 ? (
        <Empty title="Sin respuestas en este buzón">Se leen solas cada pocos minutos. Solo se guardan los correos de contactos conocidos.</Empty>
      ) : (
        <ul className="divide-y divide-line/60">
          {rows.map((r) => (
            <li key={r.id} className={`flex gap-3 px-5 py-4 ${r.read ? "" : "bg-brand/[.07]"}`}>
              <Avatar name={fullName(r.contact)} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <b className={r.read ? "font-medium" : "font-semibold"}>{fullName(r.contact)}</b>
                  <span className="text-xs text-muted">{relativeTime(r.receivedAt)}</span>
                </div>
                <div className="font-medium">{r.subject}</div>
                <p className="line-clamp-2 text-[13px] text-muted">{r.body}</p>
                <div className="mt-1"><StatusPill map={REPLY_LABEL} value={r.label} /></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
