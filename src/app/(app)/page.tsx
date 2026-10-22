import Link from "next/link";
import { db } from "@/lib/db";
import { overallStats, formatPct, pct } from "@/lib/stats";
import { domainChecks, overallHealth, sequenceVerdict, worst, type Level } from "@/lib/health";
import { CONFIRM_ON, REPLY_LABEL, fullName, relativeTime } from "@/lib/labels";
import { Kpi, PageHeader, StatusPill, Empty, Dot, CheckList, Avatar } from "@/components/ui";
import { Switch } from "@/components/Switch";
import { toggleSequence } from "./secuencias/actions";
import { runNow, checkConnections } from "./actions";

const VERDICT: Record<Level, { title: string; text: (on: number) => string; ring: string; icon: React.ReactNode }> = {
  off: {
    title: "Envíos apagados",
    text: () => "Ninguna secuencia está encendida, así que no sale ningún correo. Enciende la que quieras desde Secuencias.",
    ring: "from-[#C7C7CC] to-[#8E8E93]",
    icon: <path d="M12 4v8M7.5 6.5a7 7 0 1 0 9 0" />,
  },
  ok: {
    title: "Todo listo para enviar",
    text: (on) => `${on} ${on === 1 ? "secuencia encendida" : "secuencias encendidas"}: los correos salen solos dentro de su horario y límites.`,
    ring: "from-[#34C759] to-[#248A3D]",
    icon: <path d="m6 12.5 4 4 8-9" />,
  },
  info: {
    title: "Todo listo para enviar",
    text: (on) => `${on} ${on === 1 ? "secuencia encendida" : "secuencias encendidas"}: los correos salen solos dentro de su horario y límites.`,
    ring: "from-[#34C759] to-[#248A3D]",
    icon: <path d="m6 12.5 4 4 8-9" />,
  },
  warn: {
    title: "Envía, pero hay algo que revisar",
    text: () => "Los correos salen, aunque algún punto de abajo puede frenarlos o afectar la entrega.",
    ring: "from-[#FFB340] to-[#FF9F0A]",
    icon: <path d="M12 7v6M12 16.5v.5" />,
  },
  bad: {
    title: "Hay envíos frenados",
    text: () => "Algo impide que salgan correos. Revisa los puntos en rojo: cada uno dice qué hacer.",
    ring: "from-[#FF6961] to-[#FF3B30]",
    icon: <path d="M8 8l8 8M16 8l-8 8" />,
  },
};

export default async function Dashboard() {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [stats, health, dns, replies] = await Promise.all([
    overallStats(since),
    overallHealth(),
    domainChecks(),
    db.reply.findMany({ orderBy: { receivedAt: "desc" }, take: 5, include: { contact: true } }),
  ]);
  const verdict = VERDICT[health.level];
  const flagged = health.sequences
    .filter((s) => s.sendingOn)
    .map((s) => ({ s, checks: (health.bySequence.get(s.id) ?? []).filter((c) => c.level === "bad" || c.level === "warn") }))
    .filter((x) => x.checks.length);

  return (
    <>
      <PageHeader title="Panel" sub="Cómo va todo, de un vistazo">
        <form action={checkConnections}><button className="btn-ghost" title="Prueba la conexión de cada buzón con Gmail. No envía nada.">Comprobar conexiones</button></form>
        <form action={runNow}><button className="btn-ghost" title="Lee los buzones y procesa lo pendiente de las secuencias encendidas.">Procesar ahora</button></form>
      </PageHeader>

      <section id="estado" className="card appear scroll-mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 px-6 py-6">
          <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-b text-white shadow-lift ${verdict.ring}`}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{verdict.icon}</svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px]">{verdict.title}</h2>
            <p className="mt-0.5 max-w-2xl text-muted">{verdict.text(health.on.length)}</p>
          </div>
        </div>
        <div className="grid gap-px border-t border-line/70 bg-line/70 md:grid-cols-3">
          <div className="bg-white">
            <h3 className="flex items-center gap-2 px-5 pt-4 text-[13px] font-semibold text-muted"><Dot level={worst(health.scheduler)} /> Programador</h3>
            <CheckList checks={health.scheduler} />
          </div>
          <div className="bg-white">
            <h3 className="flex items-center justify-between gap-2 px-5 pt-4 text-[13px] font-semibold text-muted">
              <span className="flex items-center gap-2"><Dot level={worst(health.boxes.flatMap((b) => b.checks))} /> Buzones</span>
              <Link href="/buzones" className="font-medium text-brand">Ver</Link>
            </h3>
            <ul className="divide-y divide-line/70">
              {health.boxes.map((b) => (
                <li key={b.box.key}>
                  <Link href={`/buzones/${b.box.key}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-black/[.02]">
                    <Dot level={b.level} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{b.box.name}</div>
                      <div className="truncate text-[13px] text-muted">{b.level === "ok" || b.level === "info" ? b.box.email : b.checks.find((c) => c.level === b.level)?.title}</div>
                    </div>
                    <span className="text-xs tabular-nums text-muted">{b.today}/{b.box.limit}</span>
                  </Link>
                </li>
              ))}
              {health.boxes.length === 0 && <li className="px-5 py-3 text-muted">No hay buzones configurados.</li>}
            </ul>
          </div>
          <div className="bg-white">
            <h3 className="flex items-center gap-2 px-5 pt-4 text-[13px] font-semibold text-muted"><Dot level={worst(dns)} /> Dominio (llegar a la bandeja)</h3>
            <CheckList checks={dns} />
          </div>
        </div>
        {flagged.length > 0 && (
          <div className="border-t border-line/70">
            <h3 className="px-5 pt-4 text-[13px] font-semibold text-muted">Secuencias encendidas con avisos</h3>
            <ul className="divide-y divide-line/70">
              {flagged.map(({ s, checks }) => (
                <li key={s.id}>
                  <Link href={`/secuencias/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-black/[.02]">
                    <Dot level={worst(checks)} />
                    <span className="font-medium">{s.name}</span>
                    <span className="truncate text-[13px] text-muted">{checks.map((c) => c.title).join(" · ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Enviados · 30 días" value={stats.sent.toLocaleString("es-AR")} />
        <Kpi label="Apertura" value={formatPct(pct(stats.opened, stats.sent))} hint={`${stats.opened} abiertos`} />
        <Kpi label="Respuesta" value={formatPct(pct(stats.replies, stats.sent))} hint={`${stats.replies} respuestas`} />
        <Kpi label="Reuniones" value={String(stats.meetings)} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="card appear min-w-0 overflow-hidden">
          <div className="card-title"><h2>Secuencias</h2><Link href="/secuencias" className="text-[13px] font-medium text-brand">Ver todas</Link></div>
          {health.sequences.length === 0 ? (
            <Empty title="Aún no hay secuencias">Crea la primera desde Secuencias.</Empty>
          ) : (
            <ul className="divide-y divide-line/70">
              {health.sequences.slice(0, 8).map((s) => {
                const v = sequenceVerdict(health.bySequence.get(s.id) ?? []);
                return (
                  <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                    <Switch on={s.sendingOn} action={toggleSequence.bind(null, s.id, !s.sendingOn)} label={`${s.sendingOn ? "Apagar" : "Encender"} ${s.name}`} confirmOn={CONFIRM_ON} disabled={s.steps.length === 0} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/secuencias/${s.id}`} className="block truncate font-medium hover:text-brand">{s.name}</Link>
                      <div className="flex items-center gap-1.5 text-xs text-muted"><Dot level={v.level} /> {v.text}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card appear min-w-0 overflow-hidden">
          <div className="card-title"><h2>Últimas respuestas</h2><Link href="/bandeja" className="text-[13px] font-medium text-brand">Bandeja</Link></div>
          {replies.length === 0 ? (
            <Empty title="Sin respuestas todavía" />
          ) : (
            <ul className="divide-y divide-line/70">
              {replies.map((r) => (
                <li key={r.id} className="flex gap-3 px-5 py-3">
                  <Avatar name={fullName(r.contact)} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <Link href="/bandeja" className={`truncate hover:text-brand ${r.read ? "font-medium" : "font-semibold"}`}>{fullName(r.contact)}</Link>
                      <span className="shrink-0 text-xs text-muted">{relativeTime(r.receivedAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-muted"><StatusPill map={REPLY_LABEL} value={r.label} /> {r.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
