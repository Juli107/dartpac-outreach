import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ENROLLMENT_STATUS, fullName, formatDate, relativeTime } from "@/lib/labels";
import { Empty, Segmented, StatusPill } from "@/components/ui";
import { enrollContacts, removeEnrollment, setEnrollmentStatus } from "../../actions";
import { base, type Seq, type TabParams } from "./types";

const FILTERS: [string, string, (id: string) => Prisma.EnrollmentWhereInput][] = [
  ["todos", "Todos", (id) => ({ sequenceId: id })],
  ["curso", "En curso", (id) => ({ sequenceId: id, status: "ACTIVE" })],
  ["pausados", "Pausados", (id) => ({ sequenceId: id, status: "PAUSED" })],
  ["abrieron", "Abrieron", (id) => ({ sequenceId: id, messages: { some: { openedAt: { not: null } } } })],
  ["respondieron", "Respondieron", (id) => ({ sequenceId: id, status: "REPLIED" })],
  ["rebotados", "Rebotados", (id) => ({ sequenceId: id, status: "BOUNCED" })],
  ["bajas", "Bajas", (id) => ({ sequenceId: id, status: "UNSUBSCRIBED" })],
  ["terminados", "Terminados", (id) => ({ sequenceId: id, status: "FINISHED" })],
];

export async function PeopleTab({ seq, sp }: { seq: Seq; sp: TabParams }) {
  const active = FILTERS.find(([k]) => k === sp.filtro) ?? FILTERS[0];
  const [counts, enrollments, tagRows] = await Promise.all([
    Promise.all(FILTERS.map(([, , w]) => db.enrollment.count({ where: w(seq.id) }))),
    db.enrollment.findMany({
      where: active[2](seq.id),
      include: { contact: true, messages: { orderBy: { sentAt: "desc" }, take: 1, select: { sentAt: true, openedAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.contact.findMany({ select: { tags: true } }),
  ]);
  const tags = [...new Set(tagRows.flatMap((c) => c.tags))].sort();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Filtrar personas"
          active={active[0]}
          items={FILTERS.map(([k, label], i) => ({ key: k, label, count: counts[i], href: `${base(seq.id)}?tab=personas&filtro=${k}` }))}
        />
        <details className="relative">
          <summary className="btn cursor-pointer">Añadir contactos</summary>
          <form action={enrollContacts.bind(null, seq.id)} className="reveal card absolute right-0 z-20 mt-2 flex w-[320px] flex-col gap-3 p-4 shadow-lift">
            <label htmlFor="tag" className="label">Desde la etiqueta</label>
            <select id="tag" name="tag" className="input">
              <option value="">Todos los contactos</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <p className="text-xs text-muted">Se omiten bajas, rebotados, quienes ya están en esta secuencia y a quien no le llegaría ningún paso (por ejemplo, sin email válido en una secuencia solo de emails). Nadie recibe nada mientras la secuencia esté apagada.</p>
            <p className="text-xs text-muted">Para sumar empresas del Radar, usá «Sumar a una secuencia» en el Radar.</p>
            <button className="btn self-end">Inscribir</button>
          </form>
        </details>
      </div>

      <section className="card appear min-w-0 overflow-hidden">
        {enrollments.length === 0 ? (
          <Empty title={active[0] === "todos" ? "Nadie inscrito todavía" : "Nadie en este filtro"}>
            {active[0] === "todos" ? "Usa “Añadir contactos” para empezar." : null}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Contacto</th><th>Empresa</th><th>Estado</th><th>Paso</th><th>Próximo envío</th><th>Última actividad</th><th></th></tr></thead>
              <tbody>
                {enrollments.map((e) => {
                  const last = e.messages[0];
                  const live = e.status === "ACTIVE" || e.status === "PAUSED";
                  return (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/contactos?q=${encodeURIComponent(e.contact.email ?? e.contact.company ?? e.contact.phone ?? "")}`} className="font-medium text-white hover:text-brand-2">{fullName(e.contact)}</Link>
                        <div className="text-xs text-muted">{e.contact.email ?? e.contact.whatsapp ?? e.contact.phone ?? "Sin datos de contacto"}</div>
                      </td>
                      <td>{e.contact.company ?? <span className="text-muted">–</span>}</td>
                      <td><StatusPill map={ENROLLMENT_STATUS} value={e.status} /></td>
                      <td className="text-muted">{live ? `${e.nextStep} de ${seq.steps.length}` : "–"}</td>
                      <td className="text-muted">
                        {e.status === "ACTIVE" && e.nextRunAt ? (seq.sendingOn ? formatDate(e.nextRunAt) : <span title={formatDate(e.nextRunAt)}>Secuencia apagada</span>) : "–"}
                      </td>
                      <td className="text-muted">
                        {last ? (last.openedAt ? `Abrió ${relativeTime(last.openedAt)}` : `Enviado ${relativeTime(last.sentAt)}`) : "–"}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {e.status === "ACTIVE" && <form action={setEnrollmentStatus.bind(null, e.id, "PAUSED")}><button className="btn-ghost text-[13px]">Pausar</button></form>}
                          {e.status === "PAUSED" && <form action={setEnrollmentStatus.bind(null, e.id, "ACTIVE")}><button className="btn-ghost text-[13px]">Reanudar</button></form>}
                          <form action={removeEnrollment.bind(null, e.id)}><button className="btn-danger text-[13px]" aria-label={`Quitar a ${fullName(e.contact)} de la secuencia`}>Quitar</button></form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
