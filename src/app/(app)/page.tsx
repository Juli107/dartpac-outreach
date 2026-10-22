import Link from "next/link";
import { db } from "@/lib/db";
import { overallStats, sequenceStats, formatPct, pct } from "@/lib/stats";
import { SEQUENCE_STATUS, REPLY_LABEL, fullName, relativeTime } from "@/lib/labels";
import { Kpi, PageHeader, ProgressBar, StatusPill, Empty } from "@/components/ui";
import { sendingEnabled } from "@/lib/settings";
import { runNow, toggleSending } from "./actions";

export default async function Dashboard() {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [stats, sequences, replies, sending] = await Promise.all([
    overallStats(since),
    sequenceStats(),
    db.reply.findMany({ orderBy: { receivedAt: "desc" }, take: 4, include: { contact: true } }),
    sendingEnabled(),
  ]);
  return (
    <>
      <PageHeader title="Panel" sub="Últimos 30 días">
        <form action={runNow}>
          <button className="btn-ghost">Procesar envíos ahora</button>
        </form>
        <Link href="/secuencias" className="btn">Nueva secuencia</Link>
      </PageHeader>

      <section className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${sending ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        <div>
          <h2>{sending ? "Envíos encendidos" : "Envíos apagados"}</h2>
          <p className="text-sm text-muted">
            {sending
              ? "Las secuencias activas envían solas en el horario y con los límites de cada remitente."
              : "No sale ningún email ni se crean tareas, aunque haya secuencias activas. Enciéndelo cuando quieras empezar."}
          </p>
        </div>
        <form action={toggleSending.bind(null, !sending)}>
          <button className={sending ? "btn-danger" : "btn"}>{sending ? "Apagar envíos" : "Encender envíos"}</button>
        </form>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Enviados" value={stats.sent.toLocaleString("es-ES")} />
        <Kpi label="Tasa de apertura" value={formatPct(pct(stats.opened, stats.sent))} hint={`${stats.opened} abiertos`} />
        <Kpi label="Tasa de respuesta" value={formatPct(pct(stats.replies, stats.sent))} hint={`${stats.replies} respuestas`} />
        <Kpi label="Reuniones" value={String(stats.meetings)} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section className="card min-w-0">
          <h2 className="card-title">Secuencias</h2>
          {sequences.length === 0 ? (
            <Empty title="Aún no hay secuencias">Crea la primera desde Secuencias.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Secuencia</th><th>Estado</th><th>Contactos</th><th>Progreso</th><th>Respuesta</th></tr></thead>
                <tbody>
                  {sequences.map((s) => (
                    <tr key={s.id}>
                      <td><Link href={`/secuencias/${s.id}`} className="font-medium hover:text-brand">{s.name}</Link></td>
                      <td><StatusPill map={SEQUENCE_STATUS} value={s.status} /></td>
                      <td>{s._count.enrollments}</td>
                      <td><ProgressBar value={s.progress} /></td>
                      <td>{formatPct(s.replyRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card min-w-0">
          <h2 className="card-title">Últimas respuestas</h2>
          {replies.length === 0 ? (
            <Empty title="Sin respuestas todavía" />
          ) : (
            <ul>
              {replies.map((r) => (
                <li key={r.id} className="border-b border-line px-4 py-3 last:border-b-0">
                  <div className="flex justify-between gap-2">
                    <Link href="/bandeja" className="truncate font-semibold hover:text-brand">{fullName(r.contact)}</Link>
                    <span className="shrink-0 text-xs text-muted">{relativeTime(r.receivedAt)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-muted">
                    <StatusPill map={REPLY_LABEL} value={r.label} /> {r.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
