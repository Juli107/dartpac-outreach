import Link from "next/link";
import { sequenceStats, formatPct, pct } from "@/lib/stats";
import { CONFIRM_ON } from "@/lib/labels";
import { sequenceHealthMap, sequenceVerdict } from "@/lib/health";
import { PageHeader, ProgressBar, Empty, Dot } from "@/components/ui";
import { Switch } from "@/components/Switch";
import { createSequence, toggleSequence } from "./actions";

export const metadata = { title: "Secuencias" };

function Rate({ value, n }: { value: number; n: number }) {
  return (
    <div className="leading-tight">
      <div className="font-medium">{formatPct(value)}</div>
      <div className="text-xs text-muted">{n.toLocaleString("es-AR")}</div>
    </div>
  );
}

export default async function Sequences() {
  const sequences = await sequenceStats();
  const health = await sequenceHealthMap(sequences);
  const on = sequences.filter((s) => s.sendingOn).length;
  return (
    <>
      <PageHeader title="Secuencias" sub={`${sequences.length} secuencias · ${on} encendidas. Cada una tiene su propio interruptor y horario.`}>
        <details className="relative">
          <summary className="btn cursor-pointer">Nueva secuencia</summary>
          <form action={createSequence} className="reveal card absolute right-0 z-20 mt-2 flex w-[320px] flex-col gap-3 p-4 shadow-lift">
            <label htmlFor="name" className="label">Nombre</label>
            <input id="name" name="name" required autoFocus placeholder="Distribuidores · Q4" className="input" />
            <button className="btn self-end">Crear</button>
          </form>
        </details>
      </PageHeader>

      <section className="card appear min-w-0 overflow-hidden">
        {sequences.length === 0 ? (
          <Empty title="Aún no hay secuencias">Crea la primera con “Nueva secuencia”. Nace apagada: no envía nada hasta que la enciendas.</Empty>
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
                      <td className="max-w-[340px]">
                        <div className="flex items-center gap-2">
                          <Link href={`/secuencias/${s.id}`} className="truncate font-semibold hover:text-brand">{s.name}</Link>
                          {s.unread > 0 && (
                            <Link href={`/secuencias/${s.id}?tab=bandeja`} className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white" title="Respuestas sin leer">{s.unread}</Link>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          <Dot level={verdict.level} pulse={verdict.level === "ok" && s.sendingOn} />
                          <span className="truncate">{verdict.text} · {s.sender?.name ?? "Buzón general"} · {s._count.steps} pasos</span>
                        </div>
                      </td>
                      <td className="font-medium">{s._count.enrollments.toLocaleString("es-AR")}</td>
                      <td><Rate value={pct(s.contacted, s._count.enrollments)} n={s.contacted} /></td>
                      <td><Rate value={s.openRate} n={s.opened} /></td>
                      <td><Rate value={s.replyRate} n={s.replied} /></td>
                      <td className={s.bounced ? "font-medium text-[#D70015]" : "text-muted"}>{s.bounced}</td>
                      <td className={s.today >= s.dailyLimit ? "text-[#B25000]" : "text-muted"}>{s.today}/{s.dailyLimit}</td>
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
