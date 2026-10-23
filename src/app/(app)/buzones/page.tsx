import Link from "next/link";
import { db } from "@/lib/db";
import { domainChecks, mailboxHealth, schedulerChecks, worst, type Check, type Level } from "@/lib/health";
import { formatPct, pct } from "@/lib/stats";
import { PageHeader, Dot, Avatar, ProgressBar, Pill, Empty, CheckList } from "@/components/ui";
import { checkConnections } from "../actions";

export const metadata = { title: "Buzones" };

const NIVEL: Record<Level, [string, string]> = {
  ok: ["Todo en orden", "from-[#3DDC97] to-[#1E9E68]"],
  info: ["Todo en orden", "from-[#3DDC97] to-[#1E9E68]"],
  off: ["Sin envíos activos", "from-[#6B7FA3] to-[#45587C]"],
  warn: ["Hay algo para revisar", "from-[#FFD27F] to-[#F0A630]"],
  bad: ["Hay un problema que frena la entrega", "from-[#FF8A8A] to-[#E5484D]"],
};

export default async function Mailboxes() {
  const day = new Date(Date.now() - 86400_000);
  const week = new Date(Date.now() - 7 * 86400_000);
  const month = new Date(Date.now() - 30 * 86400_000);
  const [boxes, dns, scheduler, sent24, replies7, scheduled, contactados30, rebotados30, errores30, enviados30, vfy, bajas] = await Promise.all([
    mailboxHealth(),
    domainChecks(),
    schedulerChecks(),
    db.message.groupBy({ by: ["fromEmail"], where: { sentAt: { gte: day }, error: null }, _count: true }),
    db.reply.groupBy({ by: ["mailbox"], where: { receivedAt: { gte: week } }, _count: true }),
    db.enrollment.findMany({ where: { status: "ACTIVE", sequence: { status: { not: "ARCHIVED" } } }, select: { sequence: { select: { senderId: true } } } }),
    db.contact.count({ where: { enrollments: { some: { messages: { some: { sentAt: { gte: month }, error: null } } } } } }),
    db.contact.count({ where: { bounced: true, enrollments: { some: { messages: { some: { sentAt: { gte: month } } } } } } }),
    db.message.count({ where: { sentAt: { gte: month }, error: { not: null } } }),
    db.message.count({ where: { sentAt: { gte: month }, error: null } }),
    db.contact.groupBy({ by: ["emailStatus"], where: { email: { not: null } }, _count: true }),
    db.contact.count({ where: { unsubscribed: true } }),
  ]);
  const queued = new Map<string, number>();
  for (const e of scheduled) {
    const key = e.sequence.senderId;
    if (key) queued.set(key, (queued.get(key) ?? 0) + 1);
  }
  const by = <T extends { _count: number }>(rows: T[], f: (r: T) => string) => new Map(rows.map((r) => [f(r).toLowerCase(), r._count]));
  const sentMap = by(sent24, (r) => r.fromEmail);
  const repliesMap = by(replies7, (r) => r.mailbox);

  // entregabilidad: rebotes y errores del último mes
  const rebote = pct(rebotados30, contactados30);
  const entrega: Check[] = [
    contactados30 === 0
      ? { level: "info", title: "Todavía no hay envíos en los últimos 30 días" }
      : rebote > 5
        ? { level: "bad", title: `Rebotes altos: ${formatPct(rebote)}`, detail: `${rebotados30} de ${contactados30} contactos rebotaron. Por encima del 2 % Gmail empieza a mandar a spam: verificá la base antes de seguir.` }
        : rebote > 2
          ? { level: "warn", title: `Rebotes para vigilar: ${formatPct(rebote)}`, detail: `${rebotados30} de ${contactados30}. Lo sano es menos del 2 %.` }
          : { level: "ok", title: `Rebotes bajos: ${formatPct(rebote)}`, detail: `${rebotados30} de ${contactados30} contactos en 30 días (lo sano es menos del 2 %).` },
    errores30 > 0
      ? { level: errores30 > Math.max(5, enviados30 * 0.05) ? "bad" : "warn", title: `${errores30} envíos con error en 30 días`, detail: "Míralos en la pestaña Registro de cada secuencia o en el buzón." }
      : { level: "ok", title: "Sin errores de envío en 30 días", detail: `${enviados30.toLocaleString("es-AR")} correos enviados sin problemas.` },
    { level: "info", title: `${bajas} ${bajas === 1 ? "contacto pidió la baja" : "contactos pidieron la baja"}`, detail: "Cada correo lleva su enlace de baja y la cabecera List-Unsubscribe." },
  ];
  const vfyN = (k: string | null) => vfy.find((r) => r.emailStatus === k)?._count ?? 0;
  const totalEmails = vfy.reduce((a, r) => a + r._count, 0);
  const malos = vfyN("invalido") + vfyN("corregible");
  const base: Check[] = [
    malos
      ? { level: "warn", title: `${malos} ${malos === 1 ? "email con problemas" : "emails con problemas"}`, detail: `${vfyN("corregible")} con error de tipeo y ${vfyN("invalido")} inválidos. No reciben correos hasta que se corrijan.` }
      : { level: "ok", title: "Ningún email inválido en la base" },
    vfyN(null)
      ? { level: "info", title: `${vfyN(null)} sin verificar`, detail: "Se verifican al importarlos o al sumarlos desde el Radar; también podés revisarlos desde Contactos." }
      : { level: "ok", title: "Toda la base está verificada" },
    ...(vfyN("riesgoso") ? [{ level: "info" as Level, title: `${vfyN("riesgoso")} riesgosos`, detail: "Casillas de proveedores viejos o terminaciones raras: se mandan, pero pueden rebotar." }] : []),
  ];
  const general = worst([...dns, ...scheduler, ...entrega, ...boxes.flatMap((b) => b.checks)].filter((c) => c.level !== "info"));
  const [genTxt, genRing] = NIVEL[general];

  return (
    <>
      <PageHeader title="Buzones" sub="Salida y entrada de cada cuenta de Gmail, y la salud del correo para llegar a la bandeja principal.">
        <form action={checkConnections}><button className="btn-ghost" title="No envía nada">Comprobar conexiones</button></form>
        <Link href="/remitentes" className="btn">Gestionar remitentes</Link>
      </PageHeader>

      {/* Salud del correo: todo lo que decide si los correos llegan a la bandeja principal */}
      <section id="salud" className="card appear relative scroll-mt-6 overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4 px-6 py-5">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-b text-white shadow-lift ${genRing}`}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l7 3v5.5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Salud del correo</p>
            <h2 className="text-[20px]">{genTxt}</h2>
            <p className="text-[13px] text-muted">Dominio, programador, rebotes y calidad de la base: lo que decide si los correos llegan a la bandeja principal o a spam.</p>
          </div>
        </div>
        <div className="relative grid gap-px border-t border-line/60 bg-line/60 lg:grid-cols-2">
          <div className="bg-[#0e2547]">
            <h3 className="flex items-center gap-2 px-5 pt-4 text-[13px] font-semibold text-muted"><Dot level={worst(dns)} /> Dominio (llegar a la bandeja)</h3>
            <CheckList checks={dns} />
          </div>
          <div className="bg-[#0e2547]">
            <h3 className="flex items-center gap-2 px-5 pt-4 text-[13px] font-semibold text-muted"><Dot level={worst(scheduler)} /> Programador de envíos</h3>
            <CheckList checks={scheduler} />
          </div>
          <div className="bg-[#0e2547]">
            <h3 className="flex items-center gap-2 px-5 pt-4 text-[13px] font-semibold text-muted"><Dot level={worst(entrega.filter((c) => c.level !== "info"))} /> Entregas de los últimos 30 días</h3>
            <CheckList checks={entrega} />
          </div>
          <div className="bg-[#0e2547]">
            <h3 className="flex items-center justify-between gap-2 px-5 pt-4 text-[13px] font-semibold text-muted">
              <span className="flex items-center gap-2"><Dot level={worst(base.filter((c) => c.level !== "info"))} /> Calidad de la base ({totalEmails.toLocaleString("es-AR")} emails)</span>
              <Link href="/verificador" className="font-medium text-brand-2 hover:text-white">Verificador</Link>
            </h3>
            <CheckList checks={base} />
          </div>
        </div>
        <div className="relative grid gap-2 border-t border-line/60 px-6 py-4 text-[13px] text-muted md:grid-cols-3">
          <p><b className="text-white">Buzón nuevo:</b> 20–30 correos al día la primera semana y subir de a poco hasta 50–100 como mucho.</p>
          <p><b className="text-white">Texto simple:</b> el modo «Solo texto» de cada secuencia llega mejor a la bandeja principal que el HTML.</p>
          <p><b className="text-white">Base limpia:</b> verificar antes de cargar evita rebotes, que son lo que más castiga Gmail.</p>
        </div>
      </section>

      {boxes.length === 0 ? (
        <div className="card"><Empty title="No hay buzones">Agregá un remitente y conectalo con Google.</Empty></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {boxes.map(({ box, today, checks, level }, i) => (
            <Link
              key={box.key}
              href={`/buzones/${box.key}`}
              className="card appear group flex flex-col gap-4 p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-lift"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-3">
                <Avatar name={box.name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-white">{box.name}</div>
                  <div className="truncate text-[13px] text-muted">{box.email}</div>
                </div>
                <Dot level={level} pulse={level === "ok"} />
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-muted">
                  <span>Enviados hoy</span>
                  <span className="tabular-nums">{today} / {box.limit}</span>
                </div>
                <ProgressBar value={(today / Math.max(1, box.limit)) * 100} tone={today >= box.limit ? "warn" : "brand"} className="w-full" />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Salida", queued.get(box.key) ?? 0],
                  ["Enviados 24 h", sentMap.get(box.email) ?? 0],
                  ["Respuestas 7 d", repliesMap.get(box.email) ?? 0],
                ].map(([k, v]) => (
                  <div key={k} className="well py-2">
                    <dd className="text-lg font-semibold tabular-nums text-white">{v}</dd>
                    <dt className="text-[11px] text-muted">{k}</dt>
                  </div>
                ))}
              </dl>
              <ul className="grid gap-1.5">
                {checks.map((c, k) => (
                  <li key={k} className="flex items-start gap-2 text-[12.5px]">
                    <span className="pt-1"><Dot level={c.level} /></span>
                    <span className="min-w-0">
                      <span className="text-ink/90">{c.title}</span>
                      {c.detail && c.level !== "ok" && <span className="block truncate text-faint">{c.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {box.connected ? <Pill tone="ok">{box.viaGoogle ? "Conectado con Google" : "Conectado"}</Pill> : <Pill tone="bad">Sin conectar</Pill>}
              </div>
            </Link>
          ))}
        </div>
      )}

    </>
  );
}
