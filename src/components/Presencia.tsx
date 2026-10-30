"use client";

import { useEffect } from "react";

/** Avisa cada minuto, mientras la pestaña está a la vista, que el usuario sigue conectado (página Equipo). */
export function Presencia() {
  useEffect(() => {
    const avisar = () => {
      if (document.visibilityState === "visible") fetch("/api/presencia", { method: "POST", keepalive: true }).catch(() => {});
    };
    avisar();
    const t = setInterval(avisar, 60_000);
    document.addEventListener("visibilitychange", avisar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", avisar);
    };
  }, []);
  return null;
}
