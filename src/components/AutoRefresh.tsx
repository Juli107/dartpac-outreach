"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Mientras la página está abierta y visible, llama a `action` cada `seconds` y refresca los datos. */
export function AutoRefresh({ action, seconds = 60 }: { action: () => Promise<unknown>; seconds?: number }) {
  const router = useRouter();
  const [last, setLast] = useState<Date | null>(null);
  // La acción llega como función nueva en cada refresco: se guarda en una referencia para no reiniciar el ciclo.
  const accion = useRef(action);
  accion.current = action;
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        await accion.current();
        setLast(new Date());
        router.refresh();
      } finally {
        busy = false;
      }
    };
    tick();
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [seconds, router]);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
      </span>
      {last ? `Actualizada ${last.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · cada minuto` : "Revisando el correo…"}
    </span>
  );
}
