"use client";

import { useId, useRef } from "react";
import { BotonGuardar } from "./BotonGuardar";
import { BotonCerrar } from "./BotonCerrar";

const ICONO = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </svg>
);

/**
 * Duplicar una secuencia: pide el nombre de la copia (con uno libre ya puesto) y la crea apagada y sin contactos.
 * Es un diálogo nativo: va por encima de todo, así no lo corta la tabla con scroll.
 */
export function DuplicarSecuencia({
  action,
  nombre,
  sugerido,
  pasos,
  compacto = false,
}: {
  action: (f: FormData) => Promise<void>;
  nombre: string;
  sugerido: string;
  pasos: number;
  compacto?: boolean;
}) {
  const id = useId();
  const dlg = useRef<HTMLDialogElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const cerrar = () => dlg.current?.close();
  const abrir = () => {
    dlg.current?.showModal();
    requestAnimationFrame(() => campo.current?.select());
  };
  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Duplicar: hacer una copia con los mismos pasos"
        aria-label={`Duplicar ${nombre}`}
        className={compacto ? "grid h-8 w-8 shrink-0 place-items-center rounded-full text-faint transition hover:bg-white/10 hover:text-white" : "btn-ghost"}
      >
        {ICONO}
        {!compacto && "Duplicar"}
      </button>
      <dialog ref={dlg} className="dlg max-w-[440px]" aria-labelledby={`${id}-t`} onClick={(e) => e.target === dlg.current && cerrar()}>
        <form action={action} className="flex flex-col gap-4 p-5 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`${id}-t`}>Duplicar secuencia</h2>
              <p className="truncate text-[13px] text-muted">Copia de «{nombre}»</p>
            </div>
            <BotonCerrar onClick={cerrar} />
          </div>
          <div>
            <label htmlFor={`${id}-n`} className="label">Nombre de la copia</label>
            <input ref={campo} id={`${id}-n`} name="name" required maxLength={120} defaultValue={sugerido} className="input" />
          </div>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted">
            <li>Lleva {pasos === 1 ? "el paso" : `los ${pasos} pasos`} con sus variantes, el horario, el remitente y el límite diario.</li>
            <li>
              Nace <b className="font-medium text-white">apagada y sin contactos</b>: la revisás y sumás a quién le escribe en Personas.
            </li>
          </ul>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={cerrar}>Cancelar</button>
            <BotonGuardar enviando="Duplicando…" listo="Copia creada" avisarCambios={false}>Duplicar</BotonGuardar>
          </div>
        </form>
      </dialog>
    </>
  );
}
