"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Con el envío confirmado, el botón principal pasa a verde un momento. */
const enVerde = (cls: string) => cls.split(/\s+/).map((c) => (c === "btn" || c === "btn-ghost" ? "btn-wa" : c)).join(" ");

/**
 * Botón de guardar que confirma: «Guardando…» mientras viaja y «✓ Guardado» en verde al terminar. Si el formulario
 * tiene cambios que todavía no se guardaron, lo avisa al lado. Solo reacciona a su propio envío: otro botón del mismo
 * formulario (como «Eliminar variante») no lo dispara.
 */
export function BotonGuardar({
  children,
  listo = "Guardado",
  enviando = "Guardando…",
  className = "btn",
  avisarCambios = true,
  onListo,
}: {
  children: React.ReactNode;
  listo?: string;
  enviando?: string;
  className?: string;
  avisarCambios?: boolean;
  onListo?: () => void;
}) {
  const { pending, data } = useFormStatus();
  const mio = pending && data?.get("_guardar") === "1";
  const ref = useRef<HTMLButtonElement>(null);
  const viajando = useRef(false);
  const alTerminar = useRef(onListo);
  alTerminar.current = onListo;
  const [ok, setOk] = useState(false);
  const [sucio, setSucio] = useState(false);

  // Cambios sin guardar: una tecla, un chip de variable o el texto que propone la IA.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form || !avisarCambios) return;
    const marcar = () => {
      setSucio(true);
      setOk(false);
    };
    form.addEventListener("input", marcar);
    form.addEventListener("change", marcar);
    return () => {
      form.removeEventListener("input", marcar);
      form.removeEventListener("change", marcar);
    };
  }, [avisarCambios]);

  useEffect(() => {
    if (mio) viajando.current = true;
    else if (!pending && viajando.current) {
      viajando.current = false;
      setSucio(false);
      setOk(true);
      alTerminar.current?.();
    }
  }, [mio, pending]);

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(false), 3000);
    return () => clearTimeout(t);
  }, [ok]);

  return (
    <>
      {sucio && !mio && <span className="text-xs font-medium text-[#FFD587]">Cambios sin guardar</span>}
      <span className="sr-only" role="status">{ok ? listo : ""}</span>
      <button ref={ref} name="_guardar" value="1" disabled={mio} className={ok ? enVerde(className) : className}>
        {mio ? enviando : ok ? `✓ ${listo}` : children}
      </button>
    </>
  );
}
