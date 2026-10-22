"use client";

import { useOptimistic, useTransition } from "react";

/**
 * Interruptor estilo iOS ligado a una acción del servidor. Con `confirmOn`, pide confirmación
 * antes de encender (encender una secuencia envía correos reales).
 */
export function Switch({
  on,
  action,
  label,
  confirmOn,
  disabled,
  size = "md",
}: {
  on: boolean;
  action: () => Promise<void>;
  label: string;
  confirmOn?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [optimistic, setOptimistic] = useOptimistic(on);
  const [pending, start] = useTransition();
  const dims = size === "sm" ? { w: 38, h: 22, k: 18 } : { w: 51, h: 31, k: 27 };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimistic}
      aria-label={label}
      title={label}
      disabled={disabled || pending}
      onClick={() => {
        if (!optimistic && confirmOn && !window.confirm(confirmOn)) return;
        start(async () => {
          setOptimistic(!optimistic);
          await action();
        });
      }}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${optimistic ? "bg-go" : "bg-black/[.12]"}`}
      style={{ width: dims.w, height: dims.h }}
    >
      <span
        className="absolute rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.2)] transition-transform duration-200 ease-[cubic-bezier(.3,1.4,.6,1)]"
        style={{ width: dims.k, height: dims.k, left: 2, transform: `translateX(${optimistic ? dims.w - dims.k - 4 : 0}px)` }}
      />
    </button>
  );
}
