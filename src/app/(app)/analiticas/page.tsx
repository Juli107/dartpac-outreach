import { weeklySeries, sequenceStats, formatPct, overallStats, pct, cargarEnvios } from "@/lib/stats";
import { PageHeader, Kpi, Segmented } from "@/components/ui";
import { PERIODOS, periodo, desdePeriodo } from "@/lib/periodo";
import { Ranking, HiloONuevo, Tiempos, Variables } from "./Analisis";

export const metadata = { title: "Analíticas" };

function niceMax(v: number) {
  if (v <= 10) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

export default async function Analytics({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const per = periodo((await searchParams).p);
  const [series, sequences, stats, envios] = await Promise.all([
    weeklySeries(8),
    sequenceStats(),
    overallStats(new Date(Date.now() - 56 * 86400_000)),
    cargarEnvios(desdePeriodo(per.key)),
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
      <section className="card appear min-w-0 overflow-hidden">
        <div className="card-title"><h2>Envíos y respuestas por semana</h2></div>
        <div className="p-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Envíos y respuestas por semana">
            <defs>
              <linearGradient id="barra" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8CC9FF" /><stop offset="1" stopColor="#2F7BF6" /></linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - 10} y1={y(t)} y2={y(t)} stroke="rgba(160,195,255,.14)" />
                <text x={L - 6} y={y(t) + 6} textAnchor="end" className="fill-muted font-mono text-[22px] sm:text-[10px]">{t}</text>
              </g>
            ))}
            {series.map((s, i) => {
              const x = L + i * bw + bw * 0.2;
              return (
                <g key={i}>
                  <rect x={x} y={y(s.sent)} width={bw * 0.6} height={y(0) - y(s.sent)} rx={4} fill="url(#barra)">
                    <title>{`${s.sent} enviados, ${s.replies} respuestas`}</title>
                  </rect>
                  <rect x={x + bw * 0.15} y={y(s.replies)} width={bw * 0.3} height={y(0) - y(s.replies)} rx={2} fill="#3DDC97" />
                  {/* en el celular el gráfico se achica: fecha corta y letra más grande para que se lea */}
                  <text x={x + bw * 0.3} y={H - 4} textAnchor="middle" className="fill-muted font-mono text-[19px] sm:hidden">
                    {s.week.toLocaleDateString("es-ES", { day: "numeric", month: "numeric" })}
                  </text>
                  <text x={x + bw * 0.3} y={H - 8} textAnchor="middle" className="hidden fill-muted font-mono text-[10px] sm:inline">
                    {s.week.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-gradient-to-b from-brand-2 to-brand-deep" />Enviados</span>
            <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-ok" />Respuestas</span>
          </div>
        </div>
      </section>
      <section className="card appear min-w-0 overflow-hidden">
        <div className="card-title"><h2>Por secuencia</h2></div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Secuencia</th><th>Contactos</th><th>Enviados</th><th>Apertura</th><th>Respuesta</th></tr></thead>
            <tbody>
              {sequences.map((s) => (
                <tr key={s.id}><td className="min-w-[180px] !whitespace-normal font-medium text-white">{s.name}</td><td>{s._count.enrollments}</td><td>{s.sent}</td><td>{formatPct(s.openRate)}</td><td>{formatPct(s.replyRate)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <header className="appear mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">Qué consigue más respuestas</h2>
          <p className="mt-0.5 text-[14px] text-muted">Tasa de respuesta por cada variable: cuántos de los emails enviados recibieron respuesta.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Período" active={per.key} items={PERIODOS.map((x) => ({ key: x.key, href: `/analiticas?p=${x.key}`, label: x.label }))} />
          <a href={`/api/analiticas?p=${per.key}`} className="btn-ghost text-[13px]" download>
            Descargar datos (Excel/CSV)
          </a>
        </div>
      </header>
      <Ranking envios={envios} />
      {envios.length > 0 && (
        <>
          <HiloONuevo envios={envios} />
          <Tiempos envios={envios} />
          <Variables envios={envios} />
        </>
      )}
    </>
  );
}
