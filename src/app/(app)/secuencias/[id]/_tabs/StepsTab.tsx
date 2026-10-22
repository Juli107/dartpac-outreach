import Link from "next/link";
import { db } from "@/lib/db";
import { variantStats, formatPct, pct, type Funnel } from "@/lib/stats";
import { stepDays, stepVariants } from "@/lib/variants";
import { scheduleLabel } from "@/lib/labels";
import { TEMPLATE_VARIABLES, unknownVariables } from "@/lib/template";
import { Switch } from "@/components/Switch";
import { Empty } from "@/components/ui";
import {
  addStep, addVariant, deleteStep, deleteVariant, setPlainText, updateStepContent, updateStepSettings, updateVariant,
} from "../../actions";
import { base, type Seq, type TabParams } from "./types";

function delayText(order: number, delay: number) {
  if (order === 1) return delay === 0 ? "Enseguida" : `A los ${delay} días`;
  return delay === 0 ? "El mismo día" : `${delay} ${delay === 1 ? "día" : "días"} después`;
}

function FunnelLine({ f }: { f?: Funnel }) {
  if (!f?.sent) return <span className="text-xs text-muted">Sin envíos todavía</span>;
  return (
    <span className="text-xs text-muted">
      {f.sent} enviados · <b className="font-medium text-ink">{formatPct(pct(f.opened, f.sent))}</b> abiertos · <b className="font-medium text-ink">{formatPct(pct(f.replied, f.sent))}</b> respondidos
    </span>
  );
}

function StepSettings({ step }: { step: Seq["steps"][number] }) {
  return (
    <details className="group">
      <summary className="btn-ghost cursor-pointer text-[13px]">Ajustes del paso</summary>
      <form action={updateStepSettings.bind(null, step.id)} className="reveal mt-3 grid gap-3 rounded-2xl bg-black/[.025] p-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`t-${step.id}`} className="label">Tipo</label>
          <select id={`t-${step.id}`} name="type" defaultValue={step.type} className="input">
            <option value="EMAIL">Email automático</option>
            <option value="TASK">Tarea manual (llamada, LinkedIn…)</option>
          </select>
        </div>
        <div>
          <label htmlFor={`d-${step.id}`} className="label">{step.order === 1 ? "Esperar desde la inscripción (días)" : "Esperar desde el paso anterior (días)"}</label>
          <input id={`d-${step.id}`} name="delayDays" type="number" min={0} max={90} defaultValue={step.delayDays} className="input" />
        </div>
        <label className="flex items-end gap-2 pb-2.5">
          <input name="sameThread" type="checkbox" defaultChecked={step.sameThread} className="h-4 w-4 accent-[#0B2545]" />
          <span>Responder en el mismo hilo</span>
        </label>
        <div className="flex gap-2 sm:col-span-3">
          <button className="btn">Guardar</button>
        </div>
      </form>
    </details>
  );
}

export async function StepsTab({ seq, sp }: { seq: Seq; sp: TabParams }) {
  const [stats, atStep] = await Promise.all([
    variantStats(seq.id),
    db.enrollment.groupBy({ by: ["nextStep"], where: { sequenceId: seq.id, status: { in: ["ACTIVE", "PAUSED"] } }, _count: true }),
  ]);
  const waiting = new Map(atStep.map((r) => [r.nextStep, r._count]));
  const days = stepDays(seq.steps);
  const href = (q: string) => `${base(seq.id)}?tab=pasos&${q}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="card appear flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <Link href={`${base(seq.id)}?tab=ajustes`} className="chip hover:bg-black/[.07]">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          Horario: {scheduleLabel(seq)}
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[13px]">
            <b className="font-medium">Solo texto</b>
            <span className="hidden text-muted sm:inline"> · sin HTML ni seguimiento de aperturas; llega mejor a la bandeja principal</span>
          </span>
          <Switch on={seq.plainText} action={setPlainText.bind(null, seq.id, !seq.plainText)} label="Modo solo texto" size="sm" />
        </div>
      </div>

      {seq.steps.length === 0 && (
        <div className="card"><Empty title="Sin pasos">Añade el primer email abajo.</Empty></div>
      )}

      <ol className="flex flex-col gap-4">
        {seq.steps.map((step, i) => {
          const variants = stepVariants(step);
          const selected = (sp.paso === step.id && variants.find((v) => v.label === sp.variante)) || variants[0];
          const extra = step.variants.find((v) => v.label === selected.label);
          const needsSubject = !(step.sameThread && step.order > 1);
          const unknown = unknownVariables(selected.subject + selected.body);
          const isEmail = step.type === "EMAIL";
          return (
            <li key={step.id} id={`paso-${step.id}`} className="card appear scroll-mt-6" style={{ animationDelay: `${i * 40}ms` }}>
              <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-[13px] font-semibold text-white">{step.order}</span>
                  <div className="min-w-0">
                    <div className="font-semibold">
                      Paso {step.order} <span className="font-normal text-muted">· Día {days[i]} · {isEmail ? "Email" : "Tarea manual"}</span>
                    </div>
                    <div className="text-xs text-muted">{delayText(step.order, step.delayDays)}{isEmail && step.order > 1 && step.sameThread ? " · en el mismo hilo" : ""}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip" title="Contactos que esperan este paso">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>
                    {waiting.get(step.order) ?? 0}
                  </span>
                  <StepSettings step={step} />
                  <form action={deleteStep.bind(null, step.id)}><button className="btn-danger text-[13px]" aria-label={`Eliminar paso ${step.order}`}>Eliminar</button></form>
                </div>
              </header>

              {isEmail && (
                <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
                  <nav aria-label={`Variantes del paso ${step.order}`} className="seg">
                    {variants.map((v) => (
                      <Link key={v.label} href={href(`paso=${step.id}&variante=${v.label}`)} scroll={false} aria-current={v.label === selected.label ? "page" : undefined} className="seg-item min-w-9 justify-center">
                        {v.label}
                      </Link>
                    ))}
                  </nav>
                  {variants.length < 5 && (
                    <form action={addVariant.bind(null, step.id)}><button className="btn-ghost text-[13px]">+ Variante</button></form>
                  )}
                  <span className="ml-auto"><FunnelLine f={stats.get(`${step.id}:${selected.label}`)} /></span>
                </div>
              )}

              <form action={extra ? updateVariant.bind(null, extra.id) : updateStepContent.bind(null, step.id)} className="grid gap-3 p-5">
                {unknown.length > 0 && (
                  <p className="rounded-xl bg-[#FF9F0A]/[.12] px-3 py-2 text-[13px] text-[#8A3F00]">Variables desconocidas: {unknown.map((u) => `{{${u}}}`).join(", ")}.</p>
                )}
                <div>
                  <label htmlFor={`s-${step.id}-${selected.label}`} className="label">
                    {isEmail ? (needsSubject ? "Asunto" : "Asunto (vacío = “Re:” del email anterior)") : "Título de la tarea"}
                  </label>
                  <input id={`s-${step.id}-${selected.label}`} name="subject" defaultValue={selected.subject} key={`s-${selected.label}`} className="input" />
                </div>
                <div>
                  <label htmlFor={`b-${step.id}-${selected.label}`} className="label">{isEmail ? "Mensaje" : "Notas"}</label>
                  <textarea id={`b-${step.id}-${selected.label}`} name="body" rows={isEmail ? 8 : 3} defaultValue={selected.body} key={`b-${selected.label}`} className="input leading-relaxed" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {TEMPLATE_VARIABLES.map((v) => <code key={v} className="chip font-mono">{`{{${v}}}`}</code>)}
                  </div>
                  <div className="flex items-center gap-2">
                    {extra && <button formAction={deleteVariant.bind(null, extra.id)} className="btn-danger text-[13px]">Eliminar variante {extra.label}</button>}
                    <button className="btn">Guardar{isEmail ? ` variante ${selected.label}` : ""}</button>
                  </div>
                </div>
              </form>
            </li>
          );
        })}
      </ol>

      <details className="card group">
        <summary className="flex cursor-pointer items-center gap-3 px-5 py-4 font-semibold text-brand">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-lg leading-none">+</span>
          Añadir paso
        </summary>
        <form action={addStep.bind(null, seq.id)} className="reveal grid gap-3 px-5 pb-5 sm:grid-cols-3">
          <div>
            <label htmlFor="new-type" className="label">Tipo</label>
            <select id="new-type" name="type" className="input">
              <option value="EMAIL">Email automático</option>
              <option value="TASK">Tarea manual (llamada, LinkedIn…)</option>
            </select>
          </div>
          <div>
            <label htmlFor="new-delay" className="label">Días después del paso anterior</label>
            <input id="new-delay" name="delayDays" type="number" min={0} max={90} defaultValue={3} className="input" />
          </div>
          <label className="flex items-end gap-2 pb-2.5">
            <input name="sameThread" type="checkbox" defaultChecked className="h-4 w-4 accent-[#0B2545]" />
            <span>Responder en el mismo hilo</span>
          </label>
          <div className="sm:col-span-3">
            <label htmlFor="new-subject" className="label">Asunto o título</label>
            <input id="new-subject" name="subject" className="input" />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="new-body" className="label">Mensaje</label>
            <textarea id="new-body" name="body" rows={6} className="input leading-relaxed" placeholder={"Hola {{nombre|}},\n\n"} />
          </div>
          <div><button className="btn">Añadir paso</button></div>
        </form>
      </details>
    </div>
  );
}
