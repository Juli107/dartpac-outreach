"use client";

/** La cruz de los recuadros y diálogos. */
export function BotonCerrar({ onClick, label = "Cerrar" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-white/10 hover:text-white">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
