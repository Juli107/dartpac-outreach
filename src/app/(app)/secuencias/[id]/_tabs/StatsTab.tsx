import { db } from "@/lib/db";
import { formatPct, pct, variantStats } from "@/lib/stats";
import { daysToFinish, generalMailbox, pendingEmails, sentToday } from "@/lib/quota";
import { stepDays, stepVariants } from "@/lib/variants";
import { Kpi } from "@/components/ui";
import type { Seq } from "./types";

export async function StatsTab({ seq }: { seq: Seq }) {
  const id = seq.id;
  const [people, contacted, opened, replied, bounced, unsubscribed, failed, funnels, today, pendingMap] = await Promise.all([
    db.enrollment.count({ where: { sequenceId: id } }),
    db.enrollment.count({ where: { sequenceId: id, messages: { some: { error: null } } } }),
    db.enrollment.count({ where: { sequenceId: id, messages: { some: { openedAt: { not: null } } } } }),
    db.enrollment.count({ where: { sequenceId: id, status: "REPLIED" } }),
    db.enrollment.count({ where: { sequenceId: id, status: "BOUNCED" } }),
    db.enrollment.count({ where: { sequenceId: id, status: "UNSUBSCRIBED" } }),
    db.message.count({ where: { enrollment: { sequenceId: id }, error: { not: null } } }),
    variantStats(id),
    sentToday(),
    pendingEmails([id]),
  ]);
  const general = generalMailbox();
  const box = { email: seq.sender?.email.toLowerCase() ?? general.email, name: seq.sender?.name ?? "Buzón general", limit: seq.sender?.dailyLimit ?? general.dailyLimit };
  const pending = pendingMap.get(id) ?? 0;
  const seqToday = today.bySequence.get(id) ?? 0;
  const boxToday = today.byMailbox.get(box.email) ?? 0;
  const pace = Math.min(seq.dailyLimit, box.limit);
  const days = stepDays(seq.steps);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Personas" value={people.toLocaleString("es-AR")} />
        <Kpi label="Contactados" value={contacted.toLocaleString("es-AR")} hint={formatPct(pct(contacted, people))} />
        <Kpi label="Abrieron" value={formatPct(pct(opened, contacted))} hint={`${opened} personas`} />
        <Kpi label="Respondieron" value={formatPct(pct(replied, contacted))} hint={`${replied} personas`} />
        <Kpi label="Rebotados" value={String(bounced)} hint={formatPct(pct(bounced, contacted))} />
        <Kpi label="Bajas" value={String(unsubscribed)} />
      </div>

      <section className="card appear min-w-0 overflow-hidden">
        <div className="card-title"><h2>Por paso y variante</h2></div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Paso</th><th>Variante</th><th>Asunto</th><th>Enviados</th><th>Apertura</th><th>Respuesta</th></tr></thead>
            <tbody>
              {seq.steps.filter((s) => s.type === "EMAIL").flatMap((step) => {
                const i = seq.steps.indexOf(step);
                return stepVariants(step).map((v) => {
                  const f = funnels.get(`${step.id}:${v.label}`) ?? { sent: 0, opened: 0, replied: 0 };
                  return (
                    <tr key={`${step.id}-${v.label}`}>
                      <td>Paso {step.order} <span className="text-muted">· Día {days[i]}</span></td>
                      <td><span className="chip">{v.label}</span></td>
                      <td className="max-w-[320px] truncate text-muted">{v.subject || "Re: (mismo hilo)"}</td>
                      <td>{f.sent}</td>
                      <td>{seq.plainText ? <span className="text-muted">–</span> : formatPct(pct(f.opened, f.sent))}</td>
                      <td>{formatPct(pct(f.replied, f.sent))}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
        {seq.plainText && <p className="px-5 pb-4 text-xs text-muted">En modo solo texto no se miden aperturas.</p>}
      </section>

      <section className="card appear">
        <div className="card-title"><h2>Envíos y límites</h2></div>
        <dl className="grid grid-cols-2 gap-3 px-5 pb-2 md:grid-cols-4">
          {[
            ["Por enviar", String(pending)],
            ["Hoy en esta secuencia", `${seqToday} / ${seq.dailyLimit}`],
            [`Hoy desde ${box.name}`, `${boxToday} / ${box.limit}`],
            ["Envíos fallidos", String(failed)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-black/[.03] px-4 py-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-1 px-5 pb-5 pt-2 text-[13px] text-muted">
          {pending > 0 && <p>Al ritmo actual ({pace} al día) faltan unos {daysToFinish(pending, pace)} días hábiles para enviar todo.</p>}
          <p>Para no caer en spam: buzón nuevo 20–30 al día la primera semana, luego sube de a poco hasta 50–100 como mucho.</p>
        </div>
      </section>
    </div>
  );
}
