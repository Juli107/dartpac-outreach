"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { redactarConIA } from "@/app/(app)/secuencias/actions";
import { BotonGuardar } from "./BotonGuardar";

export type VarChip = { clave: string; ayuda: string };

/** Pide abrir el diálogo de variables (hay uno solo por página). */
export const abrirVariables = () => window.dispatchEvent(new CustomEvent("dp:variables"));

/** Enlace dentro de un texto que abre el diálogo de variables. */
export function AbrirVariables({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" onClick={abrirVariables} className="font-semibold underline decoration-dotted underline-offset-2 hover:text-white">
      {children}
    </button>
  );
}

/**
 * Escribe {{variable}} donde está el cursor. Si el cursor está dentro de otra {{…}}, la reemplaza: así se cambia
 * una variable por otra sin borrarla a mano. Con texto seleccionado, reemplaza la selección.
 */
function insertar(el: HTMLInputElement | HTMLTextAreaElement, texto: string) {
  const v = el.value;
  let a = el.selectionStart ?? v.length, b = el.selectionEnd ?? v.length;
  if (a === b) {
    const abre = a > 0 ? v.lastIndexOf("{{", a - 1) : -1;
    const cierra = abre >= 0 ? v.indexOf("}}", abre + 2) : -1;
    if (abre >= 0 && cierra >= 0 && a < cierra + 2 && !v.slice(abre + 2, cierra).includes("{{")) {
      a = abre;
      b = cierra + 2;
    }
  }
  el.value = v.slice(0, a) + texto + v.slice(b);
  el.focus();
  const p = a + texto.length;
  el.setSelectionRange(p, p);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Chips de variables: tocá uno y se escribe en el asunto o en el mensaje (donde estabas escribiendo).
 * Al final, «Variables» abre el diálogo para agregar las propias o cambiar qué escribe cada una.
 */
export function VarChips({ campos, lista }: { campos: string[]; lista: VarChip[] }) {
  const ultimo = useRef<string | null>(null);
  const clave = campos.join("|");
  useEffect(() => {
    const els = clave.split("|").map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const recordar = (e: FocusEvent) => {
      ultimo.current = (e.target as HTMLElement).id;
    };
    els.forEach((el) => el.addEventListener("focus", recordar));
    return () => els.forEach((el) => el.removeEventListener("focus", recordar));
  }, [clave]);
  const destino = () => {
    const activo = document.activeElement as HTMLElement | null;
    const id = activo && campos.includes(activo.id) ? activo.id : ultimo.current && campos.includes(ultimo.current) ? ultimo.current : campos[campos.length - 1];
    return document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  };
  const fijas = new Set(["saludo", "nombre", "empresa", "ciudad", "provincia", "cargo", "web", "vendedor", "mi_empresa"]);
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Variables para personalizar">
      {lista.map(({ clave: v, ayuda }) => (
        <button
          key={v}
          type="button"
          title={ayuda}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const el = destino();
            if (el) insertar(el, `{{${v}}}`);
          }}
          className={`chip font-mono transition hover:bg-brand/20 hover:text-white ${fijas.has(v) ? "" : "bg-brand/[.12] text-brand-2 ring-brand/25"}`}
        >
          {`{{${v}}}`}
        </button>
      ))}
      <button type="button" onClick={abrirVariables} title="Agregar variables propias o cambiar qué escribe cada una" className="chip transition hover:bg-white/[.1] hover:text-white">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Variables
      </button>
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
export function StepComposer({ action, orden, total, secuencia, vars, abierto = false }: { action: (f: FormData) => Promise<void>; orden: number; total: number; secuencia: string; vars: VarChip[]; abierto?: boolean }) {
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
            {tipo === "EMAIL" && <p className="mt-1 text-xs text-muted">No hace falta firmar: la firma del remitente va sola al final.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
            <VarChips campos={["new-subject", "new-body"]} lista={vars} />
            <div className="flex flex-wrap items-center gap-2">
              <AiButton tipo={tipo} orden={orden} total={Math.max(total, orden)} secuencia={secuencia} subjectId="new-subject" bodyId="new-body" />
              <BotonGuardar enviando="Agregando…" listo="Paso agregado" avisarCambios={false} onListo={() => setTipo(null)}>Agregar paso</BotonGuardar>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
