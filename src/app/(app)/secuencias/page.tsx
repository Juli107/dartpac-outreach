import Link from "next/link";
import { db } from "@/lib/db";
import { sequenceStats, formatPct, pct } from "@/lib/stats";
import { CONFIRM_ON, nombreDeCopia } from "@/lib/labels";
import { sequenceHealthMap, sequenceVerdict } from "@/lib/health";
import { PageHeader, ProgressBar, Empty, Dot, Flash } from "@/components/ui";
import { Switch } from "@/components/Switch";
import { NuevaSecuencia } from "@/components/NuevaSecuencia";
import { DuplicarSecuencia } from "@/components/DuplicarSecuencia";
import { borrarEjemplos, createSequence, duplicateSequence, toggleSequence } from "./actions";

export const metadata = { title: "Secuencias" };

const CANAL: Record<string, [string, string]> = { EMAIL: ["Email", "bg-brand"], WHATSAPP: ["WhatsApp", "bg-wa"], TASK: ["Tarea", "bg-warn"] };

function Rate({ value, n }: { value: number; n: number }) {
  return (
    <div className="leading-tight">
      <div className="font-medium text-white">{formatPct(value)}</div>
      <div className="text-xs text-faint">{n.toLocaleString("es-AR")}</div>
    </div>
  );
}

export default async function Sequences({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  const [{ nueva }, sequences, ejemplos] = await Promise.all([
    searchParams,
    sequenceStats(),
    db.sequence.count({ where: { name: { in: ["Distribuidores de embalaje · Q4", "Ecommerce · cajas personalizadas"] } } }),
  ]);
  const health = await sequenceHealthMap(sequences);
  const on = sequences.filter((s) => s.sendingOn).length;
  const nombres = sequences.map((s) => s.name);
  return (
    <>
      <PageHeader title="Secuencias" sub={`${sequences.length} ${sequences.length === 1 ? "secuencia" : "secuencias"} · ${on} encendidas. Las arman ustedes: pasos, días y mensajes propios.`}>
        <NuevaSecuencia action={createSequence} abierta={!!nueva} />
      </PageHeader>

      {ejemplos > 0 && (
        <Flash tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Quedaron {ejemplos === 1 ? "una secuencia" : "dos secuencias"} de ejemplo de la primera versión, con contactos inventados.</span>
            <form action={borrarEjemplos}><button className="btn-ghost text-[13px]">Borrar los datos de ejemplo</button></form>
          </div>
        </Flash>
      )}

      <section className="card appear min-w-0 overflow-hidden">
        {sequences.length === 0 ? (
          <Empty
            title="Todavía no armaron ninguna secuencia"
            icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20.5 3.5L10.2 13.8M20.5 3.5l-6.4 17-3.9-6.7-6.7-3.9z" /></svg>}
          >
            Una secuencia es una serie de pasos —emails que salen solos, WhatsApp listos para mandar y llamadas— con los días y los mensajes que ustedes eligen. Tocá «Nueva secuencia» para empezar.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th className="w-14"></th><th>Secuencia</th><th>Personas</th><th>Contactados</th><th>Abiertos</th><th>Respondidos</th><th>Rebotados</th><th>Hoy</th><th>Progreso</th></tr>
              </thead>
              <tbody>
                {sequences.map((s) => {
                  const verdict = sequenceVerdict(health.get(s.id) ?? []);
                  return (
                    <tr key={s.id}>
                      <td>
                        <Switch on={s.sendingOn} action={toggleSequence.bind(null, s.id, !s.sendingOn)} label={`${s.sendingOn ? "Apagar" : "Encender"} ${s.name}`} confirmOn={CONFIRM_ON} disabled={s._count.steps === 0} size="sm" />
                      </td>
                      <td className="min-w-[200px] max-w-[240px] !whitespace-normal sm:max-w-[360px] sm:!whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Link href={`/secuencias/${s.id}`} className="line-clamp-2 font-semibold text-white hover:text-brand-2 sm:truncate">{s.name}</Link>
                          {s.unread > 0 && (
                            <Link href={`/secuencias/${s.id}?tab=bandeja`} className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white" title="Respuestas sin leer">{s.unread}</Link>
                          )}
                          <DuplicarSecuencia compacto action={duplicateSequence.bind(null, s.id)} nombre={s.name} sugerido={nombreDeCopia(s.name, nombres)} pasos={s._count.steps} />
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          <Dot level={verdict.level} pulse={verdict.level === "ok" && s.sendingOn} />
                          <span className="truncate">{verdict.text} · {s.sender?.name ?? "Sin remitente"}</span>
                        </div>
                        {s.steps.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1" aria-label={`Pasos: ${s.steps.map((st) => CANAL[st.type]?.[0]).join(", ")}`}>
                            {[...s.steps].sort((a, b) => a.order - b.order).map((st) => (
                              <span key={st.id} title={CANAL[st.type]?.[0]} className={`h-1.5 w-5 rounded-full ${CANAL[st.type]?.[1] ?? "bg-white/20"} opacity-80`} />
                            ))}
                            <span className="ml-1 text-[11px] text-faint">{s._count.steps} {s._count.steps === 1 ? "paso" : "pasos"}</span>
                          </div>
                        )}
                      </td>
                      <td className="font-medium text-white">{s._count.enrollments.toLocaleString("es-AR")}</td>
                      <td><Rate value={pct(s.contacted, s._count.enrollments)} n={s.contacted} /></td>
                      <td><Rate value={s.openRate} n={s.opened} /></td>
                      <td><Rate value={s.replyRate} n={s.replied} /></td>
                      <td className={s.bounced ? "font-medium text-[#FF9A9A]" : "text-muted"}>{s.bounced}</td>
                      <td className={s.today >= s.dailyLimit ? "text-[#FFD587]" : "text-muted"}>{s.today}/{s.dailyLimit}</td>
                      <td><ProgressBar value={s.progress} className="w-24" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
