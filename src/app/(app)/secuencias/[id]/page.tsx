import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { withSignature } from "@/lib/signature";
import { renderTemplate, TEMPLATE_VARIABLES, unknownVariables } from "@/lib/template";
import { SEQUENCE_STATUS, ENROLLMENT_STATUS, fullName, formatDate } from "@/lib/labels";
import { PageHeader, StatusPill, Empty, Pill } from "@/components/ui";
import {
  setSequenceStatus, updateSequence, addStep, updateStep, deleteStep, enrollContacts, setEnrollmentStatus,
} from "../actions";

type Step = { id: string; order: number; type: string; delayDays: number; subject: string; body: string; sameThread: boolean };

function StepFields({ step, idPrefix }: { step?: Step; idPrefix: string }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${idPrefix}-type`} className="label">Tipo</label>
          <select id={`${idPrefix}-type`} name="type" defaultValue={step?.type ?? "EMAIL"} className="input">
            <option value="EMAIL">Email automático</option>
            <option value="TASK">Tarea manual (llamada, LinkedIn…)</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-delay`} className="label">Esperar (días hábiles aprox.)</label>
          <input id={`${idPrefix}-delay`} name="delayDays" type="number" min={0} max={90} defaultValue={step?.delayDays ?? 3} className="input" />
        </div>
        <label className="flex items-end gap-2 pb-2">
          <input name="sameThread" type="checkbox" defaultChecked={step?.sameThread ?? true} />
          <span>Responder en el mismo hilo</span>
        </label>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-subject`} className="label">Asunto (o título de la tarea)</label>
        <input id={`${idPrefix}-subject`} name="subject" defaultValue={step?.subject} className="input" />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-body`} className="label">Mensaje</label>
        <textarea id={`${idPrefix}-body`} name="body" rows={7} defaultValue={step?.body} className="input font-mono text-[13px]" />
      </div>
    </div>
  );
}

export default async function SequenceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seq = await db.sequence.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { order: "asc" } },
      enrollments: { include: { contact: true }, orderBy: { createdAt: "desc" }, take: 200 },
    },
  });
  if (!seq) notFound();
  const tags = (await db.contact.findMany({ select: { tags: true } })).flatMap((c) => c.tags);
  const tagCounts = [...new Set(tags)].sort();
  const sample = seq.enrollments[0]?.contact ?? { email: "marta@logisur.es", firstName: "Marta", lastName: "Ruiz", company: "Logisur", title: "Jefa de compras" };
  const firstEmail = seq.steps.find((s) => s.type === "EMAIL");

  return (
    <>
      <PageHeader
        title={seq.name}
        sub={<><StatusPill map={SEQUENCE_STATUS} value={seq.status} /> · {seq.steps.length} pasos · {seq.enrollments.length} contactos · máx. {seq.dailyLimit} emails al día</>}
      >
        {seq.status === "ACTIVE" ? (
          <form action={setSequenceStatus.bind(null, seq.id, "PAUSED")}><button className="btn-ghost">Pausar</button></form>
        ) : (
          <form action={setSequenceStatus.bind(null, seq.id, "ACTIVE")}><button className="btn" disabled={seq.steps.length === 0}>Activar</button></form>
        )}
        {seq.status !== "ARCHIVED" && (
          <form action={setSequenceStatus.bind(null, seq.id, "ARCHIVED")}><button className="btn-danger">Archivar</button></form>
        )}
      </PageHeader>

      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="card min-w-0">
          <h2 className="card-title">Pasos</h2>
          <ol className="p-4">
            {seq.steps.map((step, i) => {
              const unknown = unknownVariables(step.subject + step.body);
              return (
                <li key={step.id} className="relative grid grid-cols-[28px_1fr] gap-3 pb-4">
                  {i < seq.steps.length - 1 && <span className="absolute bottom-0 left-[13px] top-7 w-0.5 bg-line" aria-hidden />}
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft font-mono text-xs text-brand">{step.order}</span>
                  <details className="min-w-0 rounded-lg border border-line">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <b>{step.type === "EMAIL" ? "Email" : "Tarea"}</b>
                        <span className="ml-2 text-muted">{step.subject || (step.sameThread && step.order > 1 ? "Respuesta en el mismo hilo" : "(sin asunto)")}</span>
                      </span>
                      <span className="font-mono text-xs text-muted">{step.order === 1 ? `Día ${step.delayDays}` : `+${step.delayDays} días`}</span>
                    </summary>
                    <div className="border-t border-line p-3">
                      {unknown.length > 0 && (
                        <p className="mb-3 text-sm text-amber-700">Variables desconocidas: {unknown.join(", ")}. Usa {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(", ")}.</p>
                      )}
                      <form action={updateStep.bind(null, step.id)}>
                        <StepFields step={step} idPrefix={`s${step.id}`} />
                        <div className="mt-3 flex justify-between">
                          <button className="btn">Guardar paso</button>
                        </div>
                      </form>
                      <form action={deleteStep.bind(null, step.id)} className="mt-2 text-right">
                        <button className="btn-danger">Eliminar paso</button>
                      </form>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
          <details className="border-t border-line">
            <summary className="cursor-pointer px-4 py-3 font-semibold text-brand">+ Añadir paso</summary>
            <form action={addStep.bind(null, seq.id)} className="px-4 pb-4">
              <StepFields idPrefix="new" />
              <button className="btn mt-3">Añadir paso</button>
            </form>
          </details>
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="card">
            <h2 className="card-title">Vista previa · {fullName(sample)}</h2>
            {firstEmail ? (
              <div className="p-4 leading-relaxed">
                <div className="text-xs text-muted">Para: {sample.email}</div>
                <div className="mb-2 mt-1 font-semibold">{renderTemplate(firstEmail.subject, sample)}</div>
                <div className="whitespace-pre-wrap">{withSignature(renderTemplate(firstEmail.body, sample), renderTemplate(seq.signature, sample))}</div>
              </div>
            ) : (
              <Empty title="Sin pasos de email" />
            )}
          </section>

          <section className="card">
            <h2 className="card-title">Añadir contactos</h2>
            <form action={enrollContacts.bind(null, seq.id)} className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-[180px] flex-1">
                <label htmlFor="tag" className="label">Etiqueta</label>
                <select id="tag" name="tag" className="input">
                  <option value="">Todos los contactos</option>
                  {tagCounts.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button className="btn">Inscribir</button>
            </form>
            <p className="px-4 pb-4 text-xs text-muted">Se omiten los contactos dados de baja, rebotados o ya inscritos en esta secuencia.</p>
          </section>

          <section className="card">
            <h2 className="card-title">Ajustes</h2>
            <form action={updateSequence.bind(null, seq.id)} className="grid gap-3 p-4">
              <div>
                <label htmlFor="seq-name" className="label">Nombre</label>
                <input id="seq-name" name="name" defaultValue={seq.name} className="input" />
              </div>
              <div>
                <label htmlFor="seq-limit" className="label">Límite diario de emails</label>
                <input id="seq-limit" name="dailyLimit" type="number" min={1} max={2000} defaultValue={seq.dailyLimit} className="input" />
              </div>
              <div>
                <label htmlFor="seq-signature" className="label">Firma (se añade al final de cada email)</label>
                <textarea id="seq-signature" name="signature" rows={5} defaultValue={seq.signature} placeholder={"Julián\nPlupack Embalajes\nTel. 600 000 000"} className="input font-mono text-[13px]" />
              </div>
              <button className="btn justify-self-start">Guardar ajustes</button>
            </form>
          </section>
        </div>
      </div>

      <section className="card min-w-0">
        <h2 className="card-title">Contactos en esta secuencia</h2>
        {seq.enrollments.length === 0 ? (
          <Empty title="Nadie inscrito todavía">Usa “Añadir contactos” para empezar.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Contacto</th><th>Empresa</th><th>Estado</th><th>Siguiente paso</th><th>Cuándo</th><th></th></tr></thead>
              <tbody>
                {seq.enrollments.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/contactos?q=${encodeURIComponent(e.contact.email)}`} className="hover:text-brand">{fullName(e.contact)}</Link></td>
                    <td>{e.contact.company}</td>
                    <td><StatusPill map={ENROLLMENT_STATUS} value={e.status} /></td>
                    <td>{e.status === "ACTIVE" || e.status === "PAUSED" ? <Pill tone="neutral">Paso {e.nextStep}</Pill> : "–"}</td>
                    <td className="text-muted">{e.nextRunAt && e.status === "ACTIVE" ? formatDate(e.nextRunAt) : "–"}</td>
                    <td className="text-right">
                      {e.status === "ACTIVE" && <form action={setEnrollmentStatus.bind(null, e.id, "PAUSED")}><button className="btn-ghost">Pausar</button></form>}
                      {e.status === "PAUSED" && <form action={setEnrollmentStatus.bind(null, e.id, "ACTIVE")}><button className="btn-ghost">Reanudar</button></form>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
