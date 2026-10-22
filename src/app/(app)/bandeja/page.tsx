import { db } from "@/lib/db";
import { REPLY_LABEL, fullName, relativeTime } from "@/lib/labels";
import { PageHeader, StatusPill, Empty } from "@/components/ui";
import { labelReply, markRead, checkInbox } from "./actions";

export const metadata = { title: "Bandeja" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ label?: string }> }) {
  const { label } = await searchParams;
  const replies = await db.reply.findMany({
    where: label ? { label: label as never } : {},
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: { contact: true },
  });
  const unread = replies.filter((r) => !r.read).length;
  return (
    <>
      <PageHeader title="Bandeja" sub={`${unread} sin leer · cuando un contacto responde, sale de sus secuencias`}>
        <form action={checkInbox}><button className="btn-ghost">Comprobar correo</button></form>
      </PageHeader>
      <nav className="flex flex-wrap gap-2" aria-label="Filtrar por etiqueta">
        <a href="/bandeja" className={`btn-ghost ${!label ? "border-brand text-brand" : ""}`}>Todas</a>
        {Object.entries(REPLY_LABEL).map(([k, [name]]) => (
          <a key={k} href={`/bandeja?label=${k}`} className={`btn-ghost ${label === k ? "border-brand text-brand" : ""}`}>{name}</a>
        ))}
      </nav>
      <section className="card min-w-0">
        {replies.length === 0 ? (
          <Empty title="No hay respuestas">Las respuestas llegan solas cada 10 minutos si el buzón IMAP está configurado.</Empty>
        ) : (
          <ul>
            {replies.map((r) => (
              <li key={r.id} className={`grid gap-2 border-b border-line px-4 py-4 last:border-b-0 ${r.read ? "" : "bg-brand-soft/40"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <b>{fullName(r.contact)}</b>
                    <span className="text-muted"> · {r.contact.company ?? r.contact.email}</span>
                  </div>
                  <span className="text-xs text-muted">{relativeTime(r.receivedAt)}</span>
                </div>
                <div className="font-medium">{r.subject}</div>
                <p className="whitespace-pre-wrap text-muted">{r.body}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill map={REPLY_LABEL} value={r.label} />
                  <form action={labelReply.bind(null, r.id)} className="flex gap-2">
                    <select name="label" defaultValue={r.label} className="input py-1" aria-label="Clasificar respuesta">
                      {Object.entries(REPLY_LABEL).map(([k, [name]]) => <option key={k} value={k}>{name}</option>)}
                    </select>
                    <button className="btn-ghost">Clasificar</button>
                  </form>
                  {!r.read && <form action={markRead.bind(null, r.id)}><button className="btn-ghost">Marcar como leída</button></form>}
                  <span className="select-all text-xs text-muted">{r.contact.email}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
