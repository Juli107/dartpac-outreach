import { weeklySeries, sequenceStats, formatPct, overallStats, pct } from "@/lib/stats";
import { PageHeader, Kpi } from "@/components/ui";

export const metadata = { title: "Analíticas" };

function niceMax(v: number) {
  if (v <= 10) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

export default async function Analytics() {
  const [series, sequences, stats] = await Promise.all([
    weeklySeries(8),
    sequenceStats(),
    overallStats(new Date(Date.now() - 56 * 86400_000)),
  ]);
  const max = niceMax(Math.max(...series.map((s) => s.sent), 1));
  const W = 640, H = 220, L = 40, B = 26, T = 12;
  const bw = (W - L - 10) / series.length;
  const y = (v: number) => H - B - (v / max) * (H - B - T);
  const ticks = [0, max / 2, max];

  return (
    <>
      <PageHeader title="Analíticas" sub="Últimas 8 semanas" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Enviados" value={stats.sent.toLocaleString("es-ES")} />
        <Kpi label="Apertura" value={formatPct(pct(stats.opened, stats.sent))} />
        <Kpi label="Respuesta" value={formatPct(pct(stats.replies, stats.sent))} />
        <Kpi label="Rebotes" value={String(stats.bounced)} />
      </div>
      <section className="card min-w-0">
        <h2 className="card-title">Envíos y respuestas por semana</h2>
        <div className="p-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Envíos y respuestas por semana">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - 10} y1={y(t)} y2={y(t)} stroke="#DCE3EC" />
                <text x={L - 6} y={y(t) + 3} textAnchor="end" className="fill-muted font-mono text-[10px]">{t}</text>
              </g>
            ))}
            {series.map((s, i) => {
              const x = L + i * bw + bw * 0.2;
              return (
                <g key={i}>
                  <rect x={x} y={y(s.sent)} width={bw * 0.6} height={y(0) - y(s.sent)} rx={3} fill="#1F6FD1" opacity={0.85}>
                    <title>{`${s.sent} enviados, ${s.replies} respuestas`}</title>
                  </rect>
                  <rect x={x + bw * 0.15} y={y(s.replies)} width={bw * 0.3} height={y(0) - y(s.replies)} rx={2} fill="#1E8A5A" />
                  <text x={x + bw * 0.3} y={H - 8} textAnchor="middle" className="fill-muted font-mono text-[10px]">
                    {s.week.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand" />Enviados</span>
            <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-700" />Respuestas</span>
          </div>
        </div>
      </section>
      <section className="card min-w-0">
        <h2 className="card-title">Por secuencia</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Secuencia</th><th>Contactos</th><th>Enviados</th><th>Apertura</th><th>Respuesta</th></tr></thead>
            <tbody>
              {sequences.map((s) => (
                <tr key={s.id}><td>{s.name}</td><td>{s._count.enrollments}</td><td>{s.sent}</td><td>{formatPct(s.openRate)}</td><td>{formatPct(s.replyRate)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
