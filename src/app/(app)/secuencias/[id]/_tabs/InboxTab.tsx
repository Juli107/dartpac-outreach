import { db } from "@/lib/db";
import { REPLY_LABEL, fullName, relativeTime } from "@/lib/labels";
import { Avatar, Empty, StatusPill } from "@/components/ui";
import { markRead } from "../../../bandeja/actions";
import type { Seq } from "./types";

/** Respuestas de los contactos inscritos en esta secuencia. */
export async function InboxTab({ seq }: { seq: Seq }) {
  const replies = await db.reply.findMany({
    where: { contact: { enrollments: { some: { sequenceId: seq.id } } } },
    include: { contact: true },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });
  return (
    <section className="card appear min-w-0 overflow-hidden">
      {replies.length === 0 ? (
        <Empty title="Sin respuestas todavía">Cuando un contacto responde, sale de la secuencia y su respuesta aparece aquí y en la Bandeja.</Empty>
      ) : (
        <ul className="divide-y divide-line/60">
          {replies.map((r) => (
            <li key={r.id} className={`flex gap-3 px-5 py-4 ${r.read ? "" : "bg-brand/[.07]"}`}>
              <Avatar name={fullName(r.contact)} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <b className={r.read ? "font-medium" : "font-semibold"}>{fullName(r.contact)}</b>
                    <span className="text-muted"> · {r.contact.company ?? r.contact.email}</span>
                  </div>
                  <span className="text-xs text-muted">{relativeTime(r.receivedAt)}</span>
                </div>
                <div className="font-medium">{r.subject}</div>
                <p className="line-clamp-3 whitespace-pre-wrap text-muted">{r.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusPill map={REPLY_LABEL} value={r.label} />
                  {r.mailbox && <span className="text-xs text-muted">Llegó a {r.mailbox}</span>}
                  {!r.read && <form action={markRead.bind(null, r.id)}><button className="btn-ghost text-[13px]">Marcar como leída</button></form>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
