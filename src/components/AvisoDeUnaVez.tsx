"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Aviso que llega por la dirección (?creada=1, ?nuevo=…): se muestra una vez. Saca esos datos de la dirección (para
 * que no vuelva al recargar) y se va al guardar el formulario donde está, o solo, pasados unos segundos.
 */
export function AvisoDeUnaVez({
  params,
  segundos,
  span = false,
  className,
  children,
}: {
  params: string[];
  segundos?: number;
  span?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  const clave = params.join(",");
  useEffect(() => {
    const url = new URL(location.href);
    let cambio = false;
    for (const p of clave.split(",")) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        cambio = true;
      }
    }
    if (cambio) history.replaceState(null, "", url.pathname + url.search + url.hash);
    const ocultar = () => setVisible(false);
    const form = ref.current?.closest("form");
    form?.addEventListener("submit", ocultar);
    const t = segundos ? setTimeout(ocultar, segundos * 1000) : undefined;
    return () => {
      form?.removeEventListener("submit", ocultar);
      if (t) clearTimeout(t);
    };
  }, [clave, segundos]);
  if (!visible) return null;
  return span ? (
    <span ref={ref as React.RefObject<HTMLSpanElement>} role="status" className={className}>{children}</span>
  ) : (
    <p ref={ref as React.RefObject<HTMLParagraphElement>} role="status" className={className}>{children}</p>
  );
}
