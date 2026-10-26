"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BotonGuardar } from "./BotonGuardar";
import { BotonCerrar } from "./BotonCerrar";

/** «Nueva secuencia»: el recuadro se cierra con la cruz, con Cancelar, con Esc, tocando afuera o tocando el botón otra vez. */
export function NuevaSecuencia({ action, abierta = false }: { action: (f: FormData) => Promise<void>; abierta?: boolean }) {
  const [open, setOpen] = useState(abierta);
  const caja = useRef<HTMLDivElement>(null);

  const cerrar = useCallback(() => {
    setOpen(false);
    // Si se abrió desde un enlace con ?nueva=1, se saca de la dirección para que no vuelva a abrirse al recargar.
    if (new URLSearchParams(location.search).has("nueva")) history.replaceState(null, "", location.pathname);
  }, []);

  useEffect(() => {
    if (!open) return;
    const fuera = (e: PointerEvent) => caja.current && !caja.current.contains(e.target as Node) && cerrar();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [open, cerrar]);

  return (
    <div ref={caja} className="relative">
      <button type="button" className="btn" aria-expanded={open} aria-controls="nueva-secuencia" onClick={() => (open ? cerrar() : setOpen(true))}>
        Nueva secuencia
      </button>
      {open && (
        <form
          id="nueva-secuencia"
          action={action}
          className="pop absolute left-0 z-40 mt-2 flex w-[min(340px,calc(100vw-32px))] flex-col gap-3 p-4 [animation:slide-in_.2s_cubic-bezier(.2,.8,.2,1)] md:left-auto md:right-0"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px]">Nueva secuencia</h2>
            <BotonCerrar onClick={cerrar} />
          </div>
          <div>
            <label htmlFor="name" className="label">Nombre</label>
            <input id="name" name="name" required autoFocus placeholder="Frigoríficos del GBA · noviembre" className="input" />
          </div>
          <p className="text-xs text-muted">Nace vacía y apagada: después elegís cada paso (email, WhatsApp o llamada) y sus mensajes.</p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={cerrar}>Cancelar</button>
            <BotonGuardar enviando="Creando…" listo="Creada" avisarCambios={false}>Crear</BotonGuardar>
          </div>
        </form>
      )}
    </div>
  );
}
