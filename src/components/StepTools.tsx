"use client";

import { useRef, useState, useTransition } from "react";
import { redactarConIA } from "@/app/(app)/secuencias/actions";

export const VARS: [string, string][] = [
  ["saludo", "Buenos días / Buenas tardes, según la hora"],
  ["empresa", "Nombre de la empresa"],
  ["nombre", "Nombre de la persona (si se conoce)"],
  ["ciudad", "Ciudad o localidad"],
  ["provincia", "Provincia"],
  ["vendedor", "Tu nombre (quien envía)"],
  ["mi_empresa", "Plupack Embalajes"],
  ["web", "Web de la empresa"],
  ["cargo", "Cargo de la persona"],
];

/** Inserta {{variable}} donde está el cursor del campo indicado (o al final). */
function insertar(id: string, texto: string) {
  const el = document.getElementById(id) as HTMLTextAreaElement | HTMLInputElement | null;
  if (!el) return;
  const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, a) + texto + el.value.slice(b);
  el.focus();
  const p = a + texto.length;
  el.setSelectionRange(p, p);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Chips de variables: tocá uno y se escribe en el mensaje. */
export function VarChips({ targetId }: { targetId: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Variables para personalizar">
      {VARS.map(([v, help]) => (
        <button key={v} type="button" title={help} onMouseDown={(e) => e.preventDefault()} onClick={() => insertar(targetId, `{{${v}}}`)} className="chip font-mono transition hover:bg-brand/20 hover:text-white">
          {`{{${v}}}`}
        </button>
      ))}
    </div>
  );
}

/** "Redactar con IA": propone asunto y texto según el tipo de paso; si ya hay un borrador, lo mejora. */
export function AiButton({ tipo, orden, total, secuencia, subjectId, bodyId }: { tipo: "EMAIL" | "WHATSAPP" | "TASK"; orden: number; total: number; secuencia: string; subjectId?: string; bodyId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="btn-ghost text-[13px]"
        onClick={() =>
          start(async () => {
            setMsg("");
            const body = document.getElementById(bodyId) as HTMLTextAreaElement | null;
            const r = await redactarConIA({ tipo, orden, total, secuencia, borrador: body?.value.trim() || undefined });
            if ("error" in r && r.error) return setMsg(r.error);
            if (body && "texto" in r) {
              body.value = r.texto ?? "";
              body.dispatchEvent(new Event("input", { bubbles: true }));
            }
            const sub = subjectId ? (document.getElementById(subjectId) as HTMLInputElement | null) : null;
            if (sub && "asunto" in r && r.asunto && tipo !== "WHATSAPP") sub.value = r.asunto;
            setMsg("Listo: revisalo y guardá.");
          })
        }
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5 15.5l.6 1.4 1.4.6-1.4.6L5 19.5l-.6-1.4-1.4-.6 1.4-.6z" />
        </svg>
        {pending ? "Escribiendo…" : "Redactar con IA"}
      </button>
      {msg && <span className="text-xs text-muted" aria-live="polite">{msg}</span>}
    </span>
  );
}

const TIPOS: { k: "EMAIL" | "WHATSAPP" | "TASK"; t: string; d: string; icon: React.ReactNode }[] = [
  { k: "EMAIL", t: "Email", d: "Sale solo desde el buzón de la secuencia", icon: <path d="M3.5 6.5h17v11h-17zM3.8 7l8.2 6.2L20.2 7" /> },
  {
    k: "WHATSAPP",
    t: "WhatsApp",
    d: "Queda en Tareas con el mensaje listo para abrir",
    icon: <path d="M5 19l1.2-3.6A7.5 7.5 0 1 1 9 18.3zM9.3 9.2c.3 1.6 1.9 3.6 3.6 4.3l1-1 1.8.8c-.1 1.2-1 2-2.2 1.8-2.7-.4-5.3-3-5.7-5.7-.2-1.2.6-2.1 1.8-2.2l.8 1.8z" />,
  },
  { k: "TASK", t: "Llamada o tarea", d: "Llamar, visitar o mandar muestras", icon: <path d="M6.6 4h2.6l1.3 3.6-1.8 1.2a11 11 0 0 0 6.5 6.5l1.2-1.8L20 14.8v2.6a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4z" /> },
];

/** Formulario para sumar un paso: elegís el canal, cuándo sale y qué dice. */
export function StepComposer({ action, orden, total, secuencia, abierto = false }: { action: (f: FormData) => Promise<void>; orden: number; total: number; secuencia: string; abierto?: boolean }) {
  const [tipo, setTipo] = useState<"EMAIL" | "WHATSAPP" | "TASK" | null>(abierto ? "EMAIL" : null);
  const ref = useRef<HTMLFormElement>(null);
  const primero = orden === 1;
  return (
    <section className="card appear overflow-hidden" id="nuevo-paso">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div>
          <h2>{primero ? "Elegí el primer paso" : "Sumar un paso"}</h2>
          <p className="text-[13px] text-muted">{primero ? "Una secuencia es una serie de pasos con sus días y sus mensajes. Empezá por el primero." : `Será el paso ${orden}.`}</p>
        </div>
      </div>
      <div className="grid gap-2 p-5 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de paso">
        {TIPOS.map((x) => (
          <button
            key={x.k}
            type="button"
            role="radio"
            aria-checked={tipo === x.k}
            onClick={() => setTipo(x.k)}
            className={`group flex items-start gap-3 rounded-2xl p-3.5 text-left ring-1 transition duration-200 ${tipo === x.k ? "bg-brand/[.16] ring-brand/50" : "bg-white/[.04] ring-white/[.08] hover:bg-white/[.07]"}`}
          >
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${x.k === "WHATSAPP" ? "bg-wa/15 text-wa" : "bg-brand/15 text-brand-2"}`}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {x.icon}
              </svg>
            </span>
            <span className="min-w-0">
              <b className="block text-white">{x.t}</b>
              <span className="block text-xs text-muted">{x.d}</span>
            </span>
          </button>
        ))}
      </div>
      {tipo && (
        <form ref={ref} action={action} className="grid gap-3 border-t border-line/60 px-5 pb-5 pt-4 sm:grid-cols-3">
          <input type="hidden" name="type" value={tipo} />
          <div>
            <label htmlFor="new-delay" className="label">{primero ? "¿Cuándo sale?" : "Días después del paso anterior"}</label>
            {primero ? (
              <select id="new-delay" name="delayDays" defaultValue={0} className="input">
                <option value={0}>Enseguida al sumar la empresa</option>
                <option value={1}>Al día siguiente</option>
                <option value={2}>A los 2 días</option>
                <option value={3}>A los 3 días</option>
              </select>
            ) : (
              <input id="new-delay" name="delayDays" type="number" min={0} max={90} defaultValue={tipo === "TASK" ? 2 : 3} className="input" />
            )}
          </div>
          {tipo === "EMAIL" && !primero ? (
            <label className="flex items-end gap-2 pb-2.5 sm:col-span-2">
              <input name="sameThread" type="checkbox" defaultChecked className="h-4 w-4" />
              <span>Responder en el mismo hilo (sin asunto nuevo)</span>
            </label>
          ) : (
            <input type="hidden" name="sameThread" value={tipo === "EMAIL" ? "" : "on"} />
          )}
          <div className="sm:col-span-3">
            <label htmlFor="new-subject" className="label">{tipo === "EMAIL" ? (primero ? "Asunto" : "Asunto (vacío = «Re:» del email anterior)") : tipo === "WHATSAPP" ? "Título de la tarea (opcional)" : "Qué hay que hacer"}</label>
            <input id="new-subject" name="subject" className="input" required={tipo === "TASK" || (tipo === "EMAIL" && primero)} placeholder={tipo === "EMAIL" ? "{{empresa}}: film stretch y bolsas con entrega en 48 h" : tipo === "WHATSAPP" ? "WhatsApp a {{empresa}}" : "Llamar a {{empresa}} y ofrecer muestras"} />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="new-body" className="label">{tipo === "EMAIL" ? "Mensaje" : tipo === "WHATSAPP" ? "Mensaje de WhatsApp" : "Notas para quien la hace"}</label>
            <textarea id="new-body" name="body" rows={tipo === "TASK" ? 3 : 7} required={tipo !== "TASK"} className="input leading-relaxed" placeholder={tipo === "WHATSAPP" ? "{{saludo}}, ¿cómo va? Soy {{vendedor}} de {{mi_empresa}}…" : "{{saludo}},\n\n"} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
            <VarChips targetId="new-body" />
            <div className="flex flex-wrap items-center gap-2">
              <AiButton tipo={tipo} orden={orden} total={Math.max(total, orden)} secuencia={secuencia} subjectId="new-subject" bodyId="new-body" />
              <button className="btn">Agregar paso</button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
