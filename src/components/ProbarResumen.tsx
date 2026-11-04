"use client";

import { useState, useTransition } from "react";

/** «Mandarme uno ahora»: el resumen de hoy al administrador, para ver cómo llega. */
export function ProbarResumen({ action }: { action: () => Promise<{ ok: boolean; msg: string }> }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-ghost"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("¿Te mando ahora el resumen de hoy a tu mail?")) return;
          start(async () => setMsg(await action()));
        }}
      >
        {pending ? "Mandando…" : "Mandarme uno ahora"}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.msg}</span>}
    </span>
  );
}
