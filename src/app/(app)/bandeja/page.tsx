import { db } from "@/lib/db";
import { REPLY_LABEL, fullName, relativeTime } from "@/lib/labels";
import Link from "next/link";
import { PageHeader, StatusPill, Empty, Segmented, Avatar, Flash } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { labelReply, markRead, checkInbox, autoCheckInbox } from "./actions";

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
  // Buzones que se leen: el de cada remitente conectado.
  const senders = await db.sender.findMany({ where: { OR: [{ appPassword: { not: null } }, { googleRefreshToken: { not: null } }] }, select: { email: true } });
  const read = senders.map((s) => s.email);
  return (
    <>
      <PageHeader title="Bandeja" sub={`${unread} sin leer · cuando un contacto responde, sale de sus secuencias`}>
        <AutoRefresh action={autoCheckInbox} />
        <form action={checkInbox}><button className="btn-ghost">Comprobar ahora</button></form>
      </PageHeader>
      {read.length === 0 ? (
        <Flash tone="warn">
          Ningún buzón está conectado para leer respuestas. Ve a <Link href="/remitentes" className="font-semibold underline">Remitentes</Link> y toca “Conectar” con Google en tu perfil.
        </Flash>
      ) : (
        <p className="-mt-3 text-[13px] text-white/70">Leyendo {read.join(", ")}. Se guardan los correos de personas que están en Contactos.</p>
      )}
      <Segmented
        label="Filtrar por etiqueta"
        active={label ?? "todas"}
        items={[{ key: "todas", label: "Todas", href: "/bandeja" }, ...Object.entries(REPLY_LABEL).map(([k, [name]]) => ({ key: k, label: name, href: `/bandeja?label=${k}` }))]}
      />
      <section className="card appear min-w-0 overflow-hidden">
        {replies.length === 0 ? (
          <Empty title="No hay respuestas">Aquí aparecen los correos que te escriben tus contactos, en cuanto llegan a un buzón conectado.</Empty>
        ) : (
          <ul>
            {replies.map((r) => (
              <li key={r.id} className={`flex gap-3 border-b border-line/60 px-5 py-4 last:border-b-0 ${r.read ? "" : "bg-brand/[.07]"}`}>
                <Avatar name={fullName(r.contact)} size={36} />
                <div className="grid min-w-0 flex-1 gap-1.5">
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
                  <span className="select-all text-xs text-muted">{r.contact.email}{r.mailbox ? ` → ${r.mailbox}` : ""}</span>
                </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
