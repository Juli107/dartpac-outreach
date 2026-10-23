import Link from "next/link";
import { db } from "@/lib/db";
import { overallStats, formatPct, pct } from "@/lib/stats";
import { domainChecks, overallHealth, sequenceVerdict, worst, type Level } from "@/lib/health";
import { CONFIRM_ON, REPLY_LABEL, fullName, relativeTime } from "@/lib/labels";
import { Kpi, PageHeader, StatusPill, Empty, Dot, Avatar, CheckList } from "@/components/ui";
import { Switch } from "@/components/Switch";
import { CountUp } from "@/components/CountUp";
import { radarResumen } from "@/lib/radar/resumen";
import { toggleSequence } from "./secuencias/actions";
import { runNow, checkConnections } from "./actions";

const VERDICT: Record<Level, { title: string; text: (on: number) => string; ring: string; icon: React.ReactNode }> = {
  off: {
    title: "Envíos apagados",
    text: () => "Ninguna secuencia está encendida, así que no sale ningún correo. Encendé la que quieras desde Secuencias.",
    ring: "from-[#6B7FA3] to-[#45587C]",
    icon: <path d="M12 4v8M7.5 6.5a7 7 0 1 0 9 0" />,
  },
  ok: {
    title: "Todo listo para enviar",
    text: (on) => `${on} ${on === 1 ? "secuencia encendida" : "secuencias encendidas"}: los correos salen solos dentro de su horario y límites.`,
    ring: "from-[#3DDC97] to-[#1E9E68]",
    icon: <path d="m6 12.5 4 4 8-9" />,
  },
  info: {
    title: "Todo listo para enviar",
    text: (on) => `${on} ${on === 1 ? "secuencia encendida" : "secuencias encendidas"}: los correos salen solos dentro de su horario y límites.`,
    ring: "from-[#3DDC97] to-[#1E9E68]",
    icon: <path d="m6 12.5 4 4 8-9" />,
  },
  warn: {
    title: "Envía, pero hay algo que revisar",
    text: () => "Los correos salen, aunque algún punto puede frenarlos o afectar la entrega. El detalle está en Buzones.",
    ring: "from-[#FFD27F] to-[#F0A630]",
    icon: <path d="M12 7v6M12 16.5v.5" />,
  },
  bad: {
    title: "Hay envíos frenados",
    text: () => "Algo impide que salgan correos. En Buzones está cada punto en rojo con lo que hay que hacer.",
    ring: "from-[#FF8A8A] to-[#E5484D]",
    icon: <path d="M8 8l8 8M16 8l-8 8" />,
  },
};

function saludo() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return h >= 6 && h < 13 ? "Buenos días" : h >= 13 && h < 20 ? "Buenas tardes" : "Buenas noches";
}

export default async function Dashboard() {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [stats, health, dns, replies, radar, tareas] = await Promise.all([
    overallStats(since),
    overallHealth(),
    domainChecks(),
    db.reply.findMany({ orderBy: { receivedAt: "desc" }, take: 5, include: { contact: true } }),
    radarResumen(),
    db.task.groupBy({ by: ["kind"], where: { done: false }, _count: true }),
  ]);
  const verdict = VERDICT[health.level];
  const wa = tareas.find((t) => t.kind === "WHATSAPP")?._count ?? 0;
  const otras = tareas.filter((t) => t.kind !== "WHATSAPP").reduce((a, t) => a + t._count, 0);
  const boxesLevel = worst(health.boxes.flatMap((b) => b.checks));

  return (
    <>
      <PageHeader title={saludo()} sub="Tu prospección al día: envíos, respuestas y el Radar comercial">
        <form action={checkConnections}><button className="btn-ghost" title="Prueba la conexión de cada buzón con Gmail. No envía nada.">Comprobar conexiones</button></form>
        <form action={runNow}><button className="btn-ghost" title="Lee los buzones y procesa lo pendiente de las secuencias encendidas.">Procesar ahora</button></form>
        <Link href="/radar" className="btn">Buscar clientes</Link>
      </PageHeader>

      <section id="estado" className="card appear relative scroll-mt-6 overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5 px-6 py-6">
          <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-b text-white shadow-lift ${verdict.ring}`}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{verdict.icon}</svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px]">{verdict.title}</h2>
            <p className="mt-0.5 max-w-2xl text-muted">{verdict.text(health.on.length)}</p>
          </div>
          <Link href="/buzones#salud" className="btn-ghost">
            <Dot level={boxesLevel} /> Salud del correo
          </Link>
        </div>
        <details className="group relative border-t border-line/60" open={health.level === "bad" || health.level === "warn"}>
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-6 py-3 text-[13px] font-medium text-muted hover:text-white">
            <span>Detalle: programador, buzones y dominio</span>
            <span className="transition group-open:rotate-180" aria-hidden>⌄</span>
          </summary>
          <div className="reveal grid gap-px bg-line/60 md:grid-cols-3">
            <div className="bg-[#0e2547]">
              <h3 className="flex items-center gap-2 px-5 pt-4 text-[13px] font-semibold text-muted"><Dot level={worst(health.scheduler)} /> Programador</h3>
              <CheckList checks={health.scheduler} />
            </div>
            <div className="bg-[#0e2547]">
              <h3 className="flex items-center justify-between gap-2 px-5 pt-4 text-[13px] font-semibold text-muted">
                <span className="flex items-center gap-2"><Dot level={boxesLevel} /> Buzones</span>
                <Link href="/buzones" className="font-medium text-brand-2 hover:text-white">Ver</Link>
              </h3>
              <ul className="divide-y divide-line/60">
                {health.boxes.map((b) => (
                  <li key={b.box.key}>
                    <Link href={`/buzones/${b.box.key}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-white/[.03]">
                      <Dot level={b.level} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-white">{b.box.name}</div>
                        <div className="truncate text-[13px] text-muted">{b.level === "ok" || b.level === "info" ? b.box.email : b.checks.find((c) => c.level === b.level)?.title}</div>
                      </div>
                      <span className="text-xs tabular-nums text-muted">{b.today}/{b.box.limit}</span>
                    </Link>
                  </li>
                ))}
                {health.boxes.length === 0 && <li className="px-5 py-3 text-muted">No hay buzones configurados.</li>}
              </ul>
            </div>
            <div className="bg-[#0e2547]">
              <h3 className="flex items-center gap-2 px-5 pt-4 text-[13px] font-semibold text-muted"><Dot level={worst(dns)} /> Dominio (llegar a la bandeja)</h3>
              <CheckList checks={dns} />
            </div>
          </div>
        </details>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Enviados · 30 días" value={stats.sent.toLocaleString("es-AR")} accent />
        <Kpi label="Apertura" value={formatPct(pct(stats.opened, stats.sent))} hint={`${stats.opened} abiertos`} />
        <Kpi label="Respuesta" value={formatPct(pct(stats.replies, stats.sent))} hint={`${stats.replies} respuestas`} />
        <Kpi label="Reuniones" value={String(stats.meetings)} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.25fr_1fr]">
        {/* Radar */}
        <section className="card appear relative min-w-0 overflow-hidden">
          <span aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-[#2F7BF6]/20 blur-3xl" />
          <div className="card-title relative">
            <h2 className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-brand" aria-hidden><circle cx="12" cy="12" r="8.5" opacity=".45" /><circle cx="12" cy="12" r="4.6" opacity=".75" /><path d="M12 12l6.2-6.2" /></svg>
              Radar comercial
            </h2>
            <Link href="/radar" className="text-[13px] font-medium text-brand-2 hover:text-white">Abrir el mapa</Link>
          </div>
          {radar.total === 0 ? (
            <Empty title="Todavía no hay empresas en el Radar">Abrí el Radar para traer tu base desde Claude o lanzar la primera búsqueda.</Empty>
          ) : (
            <div className="relative grid gap-4 px-5 pb-5 pt-1">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Empresas", radar.total],
                  ["Para hoy", radar.hoy],
                  ["En conversación", radar.conversacion],
                  ["Nuevas · 7 días", radar.semana],
                ].map(([k, v]) => (
                  <div key={k as string} className="well px-3.5 py-3">
                    <div className="text-[11.5px] text-muted">{k}</div>
                    <div className="font-display text-[22px] font-semibold tabular-nums text-white"><CountUp value={v as number} /></div>
                  </div>
                ))}
              </div>
              {radar.buscando.length > 0 && (
                <div className="flex items-center gap-3 rounded-2xl bg-brand/[.10] px-4 py-3 ring-1 ring-brand/25">
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-2 border-t-transparent" />
                  <div className="min-w-0 text-[13px]">
                    <b className="text-white">Buscando clientes en {radar.buscando.join(", ")}</b>
                    <div className="truncate text-muted">{radar.progreso || "Claude revisa y verifica cada empresa."}</div>
                  </div>
                </div>
              )}
              {radar.porProvincia.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Dónde están</p>
                  <ul className="grid gap-1.5">
                    {radar.porProvincia.slice(0, 5).map((p) => (
                      <li key={p.n} className="flex items-center gap-3 text-[13px]">
                        <span className="w-36 shrink-0 truncate text-ink/90">{p.n}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.06]"><span className="block h-full rounded-full bg-gradient-to-r from-brand-deep to-brand-2" style={{ width: `${(p.c / radar.porProvincia[0].c) * 100}%` }} /></span>
                        <span className="w-10 text-right tabular-nums text-muted">{p.c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="card appear min-w-0 overflow-hidden">
          <div className="card-title"><h2>Para hoy</h2><Link href="/tareas" className="text-[13px] font-medium text-brand-2 hover:text-white">Tareas</Link></div>
          <ul className="divide-y divide-line/60">
            {[
              { href: "/tareas?tipo=whatsapp", ic: "💬", t: wa ? `${wa} WhatsApp listos para mandar` : "Sin WhatsApp pendientes", d: "Mensajes de las secuencias, con el texto ya escrito", on: wa > 0 },
              { href: "/tareas", ic: "📞", t: otras ? `${otras} llamadas o tareas` : "Sin llamadas pendientes", d: "Pasos manuales de las secuencias", on: otras > 0 },
              { href: "/radar?ir=" + encodeURIComponent(JSON.stringify({ tab: "hoy" })), ic: "📋", t: radar.hoy ? `${radar.hoy} seguimientos del Radar` : "Sin seguimientos del Radar", d: "Empresas que toca contactar hoy", on: radar.hoy > 0 },
              { href: "/bandeja", ic: "✉️", t: health.sequences.length ? `${replies.filter((r) => !r.read).length} respuestas sin leer` : "Bandeja", d: "Quién te respondió", on: replies.some((r) => !r.read) },
            ].map((x) => (
              <li key={x.href}>
                <Link href={x.href} className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/[.03]">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[16px] ring-1 ${x.on ? "bg-brand/15 ring-brand/25" : "bg-white/[.05] ring-white/[.08] opacity-70"}`} aria-hidden>{x.ic}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium ${x.on ? "text-white" : "text-muted"}`}>{x.t}</div>
                    <div className="truncate text-xs text-faint">{x.d}</div>
                  </div>
                  <span className="text-faint" aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="card appear min-w-0 overflow-hidden">
          <div className="card-title"><h2>Secuencias</h2><Link href="/secuencias" className="text-[13px] font-medium text-brand-2 hover:text-white">Ver todas</Link></div>
          {health.sequences.length === 0 ? (
            <Empty title="Aún no hay secuencias">Creá la primera desde Secuencias: elegís los pasos (email, WhatsApp o llamada), los días y los mensajes.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {health.sequences.slice(0, 8).map((s) => {
                const v = sequenceVerdict(health.bySequence.get(s.id) ?? []);
                return (
                  <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                    <Switch on={s.sendingOn} action={toggleSequence.bind(null, s.id, !s.sendingOn)} label={`${s.sendingOn ? "Apagar" : "Encender"} ${s.name}`} confirmOn={CONFIRM_ON} disabled={s.steps.length === 0} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/secuencias/${s.id}`} className="block truncate font-medium text-white hover:text-brand-2">{s.name}</Link>
                      <div className="flex items-center gap-1.5 text-xs text-muted"><Dot level={v.level} /> {v.text}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card appear min-w-0 overflow-hidden">
          <div className="card-title"><h2>Últimas respuestas</h2><Link href="/bandeja" className="text-[13px] font-medium text-brand-2 hover:text-white">Bandeja</Link></div>
          {replies.length === 0 ? (
            <Empty title="Sin respuestas todavía" />
          ) : (
            <ul className="divide-y divide-line/60">
              {replies.map((r) => (
                <li key={r.id} className="flex gap-3 px-5 py-3">
                  <Avatar name={fullName(r.contact)} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <Link href="/bandeja" className={`truncate hover:text-brand-2 ${r.read ? "font-medium text-ink" : "font-semibold text-white"}`}>{fullName(r.contact)}</Link>
                      <span className="shrink-0 text-xs text-faint">{relativeTime(r.receivedAt)}</span>
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
