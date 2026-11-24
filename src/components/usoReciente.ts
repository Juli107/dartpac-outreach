"use client";

/**
 * Última vez que alguien tocó la página (mouse, teclado, toque o rueda). Los avisos que consultan al servidor
 * cada minuto se saltean cuando la página quedó abierta sin uso: cada consulta despierta la base de datos.
 * Apenas alguien vuelve a tocar algo, `alVolver` dispara una consulta en el momento.
 */
let ultima = Date.now();
const alVolverCbs = new Set<() => void>();
const QUIETO_MS = 15 * 60_000;

if (typeof window !== "undefined") {
  const marcar = () => {
    const antes = ultima;
    ultima = Date.now();
    if (ultima - antes > QUIETO_MS) alVolverCbs.forEach((f) => f());
  };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, marcar, { passive: true, capture: true });
}

/** true si pasaron más de 15 minutos sin que nadie toque la página. */
export function sinUso() {
  return Date.now() - ultima > QUIETO_MS;
}

/** Llama a `f` cuando alguien vuelve después de un rato sin uso. Devuelve la función para dejar de escuchar. */
export function alVolver(f: () => void) {
  alVolverCbs.add(f);
  return () => {
    alVolverCbs.delete(f);
  };
}
