import { db } from "@/lib/db";
import { formatDate, fullName } from "@/lib/labels";
import { Empty, Pill } from "@/components/ui";
import type { Seq } from "./types";

export async function LogTab({ seq }: { seq: Seq }) {
  const [messages, tasks] = await Promise.all([
    db.message.findMany({
      where: { enrollment: { sequenceId: seq.id } },
      include: { enrollment: { include: { contact: true } }, step: { select: { order: true } } },
      orderBy: { sentAt: "desc" },
      take: 150,
    }),
    db.task.findMany({
      where: { enrollment: { sequenceId: seq.id } },
      include: { enrollment: { include: { contact: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <section className="card appear min-w-0 overflow-hidden">
        <div className="card-title"><h2>Emails</h2><span className="text-xs text-muted">Últimos 150</span></div>
        {messages.length === 0 ? (
          <Empty title="Todavía no salió ningún email">Cuando la secuencia esté encendida, cada envío aparece aquí con su resultado.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Contacto</th><th>Paso</th><th>Asunto</th><th>Desde</th><th>Resultado</th></tr></thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td className="text-muted">{formatDate(m.sentAt)}</td>
                    <td>{fullName(m.enrollment.contact)}<div className="text-xs text-muted">{m.enrollment.contact.email}</div></td>
                    <td className="text-muted">{m.step.order} · {m.variant}</td>
                    <td className="max-w-[280px] truncate">{m.subject}</td>
                    <td className="text-muted">{m.fromEmail}</td>
                    <td className="max-w-[320px] whitespace-normal">
                      {m.error ? (
                        <><Pill tone="bad">Error</Pill> <span className="text-xs text-[#FF9A9A]">{m.error}</span></>
                      ) : m.openedAt ? (
                        <Pill tone="ok">Abierto{m.openCount > 1 ? ` ×${m.openCount}` : ""}</Pill>
                      ) : (
                        <Pill tone="info">Enviado</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {tasks.length > 0 && (
        <section className="card appear min-w-0 overflow-hidden">
          <div className="card-title"><h2>Tareas creadas</h2></div>
          <ul className="divide-y divide-line/60">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-muted">{fullName(t.enrollment.contact)} · {formatDate(t.createdAt)}</div>
                </div>
                <Pill tone={t.done ? "ok" : "warn"}>{t.done ? "Hecha" : "Pendiente"}</Pill>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
