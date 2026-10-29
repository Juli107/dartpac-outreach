import Link from "next/link";
import { db } from "@/lib/db";
import { variantStats, formatPct, pct, type Funnel } from "@/lib/stats";
import { stepDays, stepVariants } from "@/lib/variants";
import { scheduleLabel } from "@/lib/labels";
import { MI_EMPRESA, unknownVariables } from "@/lib/template";
import { cargarVariables, chipsDeVariables, clavesPropias } from "@/lib/variables";
import { Switch } from "@/components/Switch";
import { AbrirVariables, AiButton, StepComposer, VarChips } from "@/components/StepTools";
import { BotonGuardar } from "@/components/BotonGuardar";
import { VariablesDialog } from "@/components/VariablesDialog";
import { AvisoDeUnaVez } from "@/components/AvisoDeUnaVez";
import {
  addStep, addVariant, deleteStep, deleteVariant, moveStep, setPlainText, updateStepContent, updateStepSettings, updateVariant,
} from "../../actions";
import { base, type Seq, type TabParams } from "./types";

const TIPO: Record<string, { t: string; tone: string; icon: React.ReactNode }> = {
  EMAIL: { t: "Email", tone: "bg-brand/15 text-brand-2 ring-brand/25", icon: <path d="M3.5 6.5h17v11h-17zM3.8 7l8.2 6.2L20.2 7" /> },
  WHATSAPP: { t: "WhatsApp", tone: "bg-wa/15 text-wa ring-wa/25", icon: <path d="M5 19l1.2-3.6A7.5 7.5 0 1 1 9 18.3zM9.3 9.2c.3 1.6 1.9 3.6 3.6 4.3l1-1 1.8.8c-.1 1.2-1 2-2.2 1.8-2.7-.4-5.3-3-5.7-5.7-.2-1.2.6-2.1 1.8-2.2l.8 1.8z" /> },
  TASK: { t: "Llamada o tarea", tone: "bg-warn/15 text-warn ring-warn/25", icon: <path d="M6.6 4h2.6l1.3 3.6-1.8 1.2a11 11 0 0 0 6.5 6.5l1.2-1.8L20 14.8v2.6a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4z" /> },
};

function delayText(order: number, delay: number) {
  if (order === 1) return delay === 0 ? "Enseguida al sumar la empresa" : `A los ${delay} días de sumarla`;
  return delay === 0 ? "El mismo día que el anterior" : `${delay} ${delay === 1 ? "día" : "días"} después del anterior`;
}

function FunnelLine({ f }: { f?: Funnel }) {
  if (!f?.sent) return <span className="text-xs text-muted">Sin envíos todavía</span>;
  return (
    <span className="text-xs text-muted">
      {f.sent} enviados · <b className="font-medium text-white">{formatPct(pct(f.opened, f.sent))}</b> abiertos · <b className="font-medium text-white">{formatPct(pct(f.replied, f.sent))}</b> respondidos
    </span>
  );
}

function StepSettings({ step }: { step: Seq["steps"][number] }) {
  return (
    <details className="group">
      <summary className="btn-ghost cursor-pointer text-[13px]">Ajustes</summary>
      <form action={updateStepSettings.bind(null, step.id)} className="reveal well mt-3 grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`t-${step.id}`} className="label">Tipo</label>
          <select id={`t-${step.id}`} name="type" defaultValue={step.type} className="input">
            <option value="EMAIL">Email automático</option>
            <option value="WHATSAPP">WhatsApp (tarea con el mensaje listo)</option>
            <option value="TASK">Llamada o tarea manual</option>
          </select>
        </div>
        <div>
          <label htmlFor={`d-${step.id}`} className="label">{step.order === 1 ? "Esperar desde que se suma (días)" : "Esperar desde el paso anterior (días)"}</label>
          <input id={`d-${step.id}`} name="delayDays" type="number" min={0} max={90} defaultValue={step.delayDays} className="input" />
        </div>
        <label className="flex items-end gap-2 pb-2.5">
          <input name="sameThread" type="checkbox" defaultChecked={step.sameThread} className="h-4 w-4" />
          <span>Responder en el mismo hilo</span>
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <BotonGuardar listo="Ajustes del paso guardados">Guardar</BotonGuardar>
        </div>
      </form>
    </details>
  );
}

export async function StepsTab({ seq, sp }: { seq: Seq; sp: TabParams }) {
  const [stats, atStep, vars] = await Promise.all([
    variantStats(seq.id),
    db.enrollment.groupBy({ by: ["nextStep"], where: { sequenceId: seq.id, status: { in: ["ACTIVE", "PAUSED"] } }, _count: true }),
    cargarVariables(),
  ]);
  const chips = chipsDeVariables(vars);
  const propias = clavesPropias(vars);
  const waiting = new Map(atStep.map((r) => [r.nextStep, r._count]));
  const days = stepDays(seq.steps);
  const href = (q: string) => `${base(seq.id)}?tab=pasos&${q}`;
  const total = seq.steps.length;

  return (
    <div className="flex flex-col gap-4">
      {total > 0 && (
        <div className="card appear flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <Link href={`${base(seq.id)}?tab=ajustes`} className="chip transition hover:bg-white/[.1] hover:text-white">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            Horario: {scheduleLabel(seq)}
          </Link>
          {seq.steps.some((st) => st.type === "EMAIL") && (
            <div className="flex items-center gap-3">
              <span className="text-[13px]">
                <b className="font-medium text-white">Solo texto</b>
                <span className="hidden text-muted sm:inline"> · sin HTML ni seguimiento de aperturas; llega mejor a la bandeja principal</span>
              </span>
              <Switch on={seq.plainText} action={setPlainText.bind(null, seq.id, !seq.plainText)} label="Modo solo texto" size="sm" />
            </div>
          )}
        </div>
      )}

      {/* línea de tiempo de la secuencia */}
      {total > 0 && (
        <div className="card appear overflow-x-auto px-5 py-4">
          <ol className="flex min-w-max items-center gap-2">
            {seq.steps.map((st, i) => (
              <li key={st.id} className="flex items-center gap-2">
                <a href={`#paso-${st.id}`} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 transition hover:brightness-125 ${TIPO[st.type].tone}`}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{TIPO[st.type].icon}</svg>
                  Día {days[i]} · {TIPO[st.type].t}
                </a>
                {i < total - 1 && <span className="h-px w-6 bg-line" aria-hidden />}
              </li>
            ))}
          </ol>
        </div>
      )}

      <ol className="flex flex-col gap-4">
        {seq.steps.map((step, i) => {
          const variants = stepVariants(step);
          const selected = (sp.paso === step.id && variants.find((v) => v.label === sp.variante)) || variants[0];
          const extra = step.variants.find((v) => v.label === selected.label);
          const isEmail = step.type === "EMAIL";
          const isWa = step.type === "WHATSAPP";
          const needsSubject = isEmail && !(step.sameThread && step.order > 1);
          const unknown = unknownVariables(selected.subject + selected.body, propias);
          const esNuevo = sp.nuevo === step.id;
          const aviso = sp.paso === step.id ? (sp.creada && extra ? "creada" : sp.borrada ? "borrada" : null) : null;
          const sId = `s-${step.id}-${selected.label}`, bId = `b-${step.id}-${selected.label}`;
          return (
            <li key={step.id} id={`paso-${step.id}`} className="card appear scroll-mt-6" style={{ animationDelay: `${i * 40}ms` }}>
              <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${TIPO[step.type].tone}`}>
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{TIPO[step.type].icon}</svg>
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-white">
                      Paso {step.order} <span className="font-normal text-muted">· Día {days[i]} · {TIPO[step.type].t}</span>
                      {esNuevo && (
                        <AvisoDeUnaVez span params={["nuevo"]} segundos={8} className="ml-2 rounded-full bg-ok/15 px-2 py-0.5 align-middle text-[11.5px] font-semibold text-[#7BE3B4] ring-1 ring-ok/25">
                          ✓ Paso agregado
                        </AvisoDeUnaVez>
                      )}
                    </div>
                    <div className="text-xs text-muted">{delayText(step.order, step.delayDays)}{isEmail && step.order > 1 && step.sameThread ? " · en el mismo hilo" : ""}{isWa ? " · aparece en Tareas con el mensaje listo" : ""}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="chip" title="Contactos que esperan este paso">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>
                    {waiting.get(step.order) ?? 0}
                  </span>
                  {i > 0 && <form action={moveStep.bind(null, step.id, -1)}><button className="btn-ghost px-2.5 text-[13px]" aria-label={`Subir el paso ${step.order}`} title="Subir">↑</button></form>}
                  {i < total - 1 && <form action={moveStep.bind(null, step.id, 1)}><button className="btn-ghost px-2.5 text-[13px]" aria-label={`Bajar el paso ${step.order}`} title="Bajar">↓</button></form>}
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
                    <form action={addVariant.bind(null, step.id)}><button className="btn-ghost text-[13px]" title="Probá otro asunto o texto con una parte de los contactos">+ Variante</button></form>
                  )}
                  <span className="ml-auto"><FunnelLine f={stats.get(`${step.id}:${selected.label}`)} /></span>
                </div>
              )}

              <form action={extra ? updateVariant.bind(null, extra.id) : updateStepContent.bind(null, step.id)} className="grid gap-3 p-5">
                {aviso === "creada" && (
                  <AvisoDeUnaVez params={["creada"]} className="rounded-xl bg-ok/[.12] px-3 py-2 text-[13px] text-[#9BEBC6] ring-1 ring-ok/25">
                    ✓ Se creó la <b className="font-semibold text-white">variante {selected.label}</b> como copia de la A. Cambiale el asunto o el texto y tocá «Guardar variante {selected.label}». Los contactos se reparten entre las variantes.
                  </AvisoDeUnaVez>
                )}
                {aviso === "borrada" && (
                  <AvisoDeUnaVez params={["borrada"]} segundos={8} className="rounded-xl bg-white/[.06] px-3 py-2 text-[13px] text-muted ring-1 ring-white/[.08]">
                    Se eliminó la variante {sp.borrada}.
                  </AvisoDeUnaVez>
                )}
                {unknown.length > 0 && (
                  <p className="rounded-xl bg-warn/[.12] px-3 py-2 text-[13px] text-[#FFD587] ring-1 ring-warn/20">
                    Variables desconocidas: {unknown.map((u) => `{{${u}}}`).join(", ")}. Corregila o <AbrirVariables>agregala en Variables</AbrirVariables>.
                  </p>
                )}
                <div>
                  <label htmlFor={sId} className="label">
                    {isEmail ? (needsSubject ? "Asunto" : "Asunto (vacío = “Re:” del email anterior)") : isWa ? "Título de la tarea (opcional)" : "Qué hay que hacer"}
                  </label>
                  <input id={sId} name="subject" defaultValue={selected.subject} key={`s-${selected.label}`} className="input" />
                </div>
                <div>
                  <label htmlFor={bId} className="label">{isEmail ? "Mensaje" : isWa ? "Mensaje de WhatsApp" : "Notas"}</label>
                  <textarea id={bId} name="body" rows={isEmail ? 8 : isWa ? 5 : 3} defaultValue={selected.body} key={`b-${selected.label}`} className="input leading-relaxed" />
                  {isEmail && <p className="mt-1 text-xs text-muted">No hace falta firmar: la firma {seq.sender ? `de ${seq.sender.name}` : "del remitente"} va sola al final.</p>}
                </div>
                {isWa && (
                  <fieldset className="grid gap-3 rounded-2xl bg-white/[.03] p-3 ring-1 ring-white/[.08] sm:grid-cols-[1fr_120px]">
                    <legend className="px-1 text-[13px] font-semibold text-white">Envío automático (API oficial de WhatsApp)</legend>
                    <div>
                      <label htmlFor={`wt-${step.id}`} className="label">Plantilla aprobada en Meta</label>
                      <input id={`wt-${step.id}`} name="waTemplate" defaultValue={step.waTemplate} placeholder="primer_contacto" className="input" />
                    </div>
                    <div>
                      <label htmlFor={`wl-${step.id}`} className="label">Idioma</label>
                      <input id={`wl-${step.id}`} name="waLang" defaultValue={step.waLang} placeholder="es_AR" className="input" />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`wp-${step.id}`} className="label">Qué va en {"{{1}}, {{2}}…"} de la plantilla</label>
                      <input id={`wp-${step.id}`} name="waParams" defaultValue={step.waParams} placeholder="{{nombre}}, {{mi_nombre}}" className="input" />
                      <p className="mt-1 text-xs text-muted">Separado por comas, en el mismo orden que en Meta. Sin plantilla, o si el número del remitente no está conectado a la API, el paso queda en Tareas con el mensaje listo como hasta ahora.</p>
                    </div>
                  </fieldset>
                )}
                <div><AiButton tipo={step.type} orden={step.order} total={total} secuencia={seq.name} subjectId={sId} bodyId={bId} /></div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <VarChips campos={[sId, bId]} lista={chips} />
                  <div className="flex flex-wrap items-center gap-2">
                    {extra && <button formAction={deleteVariant.bind(null, extra.id)} className="btn-danger text-[13px]">Eliminar variante {extra.label}</button>}
                    <BotonGuardar key={`${step.id}-${selected.label}`} listo={isEmail && variants.length > 1 ? `Variante ${selected.label} guardada` : "Paso guardado"}>
                      Guardar{isEmail && variants.length > 1 ? ` variante ${selected.label}` : ""}
                    </BotonGuardar>
                  </div>
                </div>
              </form>
            </li>
          );
        })}
      </ol>

      <StepComposer action={addStep.bind(null, seq.id)} orden={total + 1} total={total + 1} secuencia={seq.name} vars={chips} />
      <VariablesDialog config={vars} miEmpresa={MI_EMPRESA()} />
    </div>
  );
}
