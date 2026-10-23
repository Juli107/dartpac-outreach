import Link from "next/link";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fullName, relativeTime } from "@/lib/labels";
import { contactWa, waLink } from "@/lib/whatsapp";
import { eventoRadar } from "@/lib/radar/outreach";
import { PageHeader, Empty, Segmented, Pill } from "@/components/ui";

export const metadata = { title: "Tareas" };

async function toggleTask(id: string, done: boolean) {
  "use server";
  const t = await db.task.update({ where: { id }, data: { done }, include: { enrollment: { include: { contact: true, sequence: { select: { name: true } } } } } });
  if (done) {
    const c = t.enrollment.contact;
    if (t.kind === "WHATSAPP") await eventoRadar(c, { k: "wa", secuencia: t.enrollment.sequence.name });
    else await eventoRadar(c, { k: "tarea", secuencia: t.enrollment.sequence.name, titulo: t.title });
  }
  revalidatePath("/", "layout");
}

const FILTROS: [string, string, Prisma.TaskWhereInput][] = [
  ["todas", "Todas", {}],
  ["whatsapp", "WhatsApp", { kind: "WHATSAPP" }],
  ["llamadas", "Llamadas y tareas", { kind: { not: "WHATSAPP" } }],
];

export default async function Tasks({ searchParams }: { searchParams: Promise<{ hechas?: string; tipo?: string }> }) {
  const sp = await searchParams;
  const showDone = sp.hechas === "1";
  const filtro = FILTROS.find(([k]) => k === sp.tipo) ?? FILTROS[0];
  const where: Prisma.TaskWhereInput = { done: showDone, ...filtro[2] };
  const [tasks, counts] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: { createdAt: showDone ? "desc" : "asc" },
      take: 200,
      include: { enrollment: { include: { contact: true, sequence: { select: { id: true, name: true } } } } },
    }),
    Promise.all(FILTROS.map(([, , w]) => db.task.count({ where: { done: showDone, ...w } }))),
  ]);
  const qs = (o: Record<string, string>) => `/tareas?${new URLSearchParams({ ...(showDone ? { hechas: "1" } : {}), ...(filtro[0] !== "todas" ? { tipo: filtro[0] } : {}), ...o })}`;
  return (
    <>
      <PageHeader title="Tareas" sub="Los pasos que hace una persona: WhatsApp con el mensaje listo, llamadas, visitas y envío de muestras.">
        <Link href={showDone ? "/tareas" : "/tareas?hechas=1"} className="btn-ghost">{showDone ? "Ver pendientes" : "Ver hechas"}</Link>
      </PageHeader>
      <Segmented label="Filtrar tareas" active={filtro[0]} items={FILTROS.map(([k, label], i) => ({ key: k, label, count: counts[i], href: qs({ tipo: k }) }))} />
      <section className="card appear min-w-0 overflow-hidden">
        {tasks.length === 0 ? (
          <Empty title={showDone ? "Aún no completaron tareas" : "No hay tareas pendientes"}>
            {showDone ? null : "Cuando una secuencia llegue a un paso de WhatsApp o de llamada, aparece acá con todo listo."}
          </Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {tasks.map((t) => {
              const c = t.enrollment.contact;
              const wa = t.kind === "WHATSAPP" ? contactWa(c) : "";
              return (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  {/* base de 20rem: en el celular los botones bajan a su propia fila en vez de aplastar el texto */}
                  <div className="flex min-w-0 flex-[1_1_20rem] gap-3">
                    <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${t.kind === "WHATSAPP" ? "bg-wa/15 text-wa ring-wa/25" : "bg-warn/15 text-warn ring-warn/25"}`} aria-hidden>
                      {t.kind === "WHATSAPP" ? (
                        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19l1.2-3.6A7.5 7.5 0 1 1 9 18.3zM9.3 9.2c.3 1.6 1.9 3.6 3.6 4.3l1-1 1.8.8c-.1 1.2-1 2-2.2 1.8-2.7-.4-5.3-3-5.7-5.7-.2-1.2.6-2.1 1.8-2.2l.8 1.8z" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.6 4h2.6l1.3 3.6-1.8 1.2a11 11 0 0 0 6.5 6.5l1.2-1.8L20 14.8v2.6a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4z" /></svg>
                      )}
                    </span>
                    <div className="min-w-0">
                      <b className="text-white">{t.title}</b>
                      <div className="text-[13px] text-muted">
                        {fullName(c)}{c.city ? ` · ${c.city}` : ""} · <Link href={`/secuencias/${t.enrollment.sequence.id}`} className="hover:text-white">{t.enrollment.sequence.name}</Link> · {relativeTime(t.createdAt)}
                      </div>
                      {t.notes && <p className={`mt-2 whitespace-pre-wrap text-[13.5px] ${t.kind === "WHATSAPP" ? "rounded-2xl rounded-tl-md bg-[#0F3B2A]/70 px-3.5 py-2.5 text-[#E6FFF2] ring-1 ring-wa/20" : "text-ink/90"}`}>{t.notes}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {c.phone && <span className="select-all">{c.phone}</span>}
                        {c.whatsapp && c.whatsapp !== c.phone && <span className="select-all">WhatsApp {c.whatsapp}</span>}
                        {c.email && <span className="select-all">{c.email}</span>}
                        {c.radarId && <Pill tone="info">Del Radar</Pill>}
                        {t.kind === "WHATSAPP" && !wa && <Pill tone="warn">Sin WhatsApp válido</Pill>}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full max-sm:pl-[52px]">
                    {wa && !t.done && (
                      <a href={waLink(wa, t.notes)} target="_blank" rel="noopener noreferrer" className="btn-wa">
                        Abrir WhatsApp
                      </a>
                    )}
                    <form action={toggleTask.bind(null, t.id, !t.done)}>
                      <button className={t.done ? "btn-ghost" : "btn"}>{t.done ? "Reabrir" : t.kind === "WHATSAPP" ? "Ya lo mandé" : "Hecha"}</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
