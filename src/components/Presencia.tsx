"use client";

import { useEffect } from "react";
import { sinUso, alVolver } from "./usoReciente";

/** Avisa cada minuto, mientras la pestaña está a la vista y en uso, que el usuario sigue conectado (página Equipo). */
export function Presencia() {
  useEffect(() => {
    const avisar = () => {
      if (document.visibilityState === "visible" && !sinUso()) fetch("/api/presencia", { method: "POST", keepalive: true }).catch(() => {});
    };
    avisar();
    const t = setInterval(avisar, 60_000);
    document.addEventListener("visibilitychange", avisar);
    const dejar = alVolver(avisar);
    return () => {
      dejar();
      clearInterval(t);
      document.removeEventListener("visibilitychange", avisar);
    };
  }, []);
  return null;
}
