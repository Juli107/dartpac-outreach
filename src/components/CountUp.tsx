"use client";

import { useEffect, useRef, useState } from "react";

/** Número que sube desde cero al aparecer (se queda quieto con movimiento reducido). */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [n, setN] = useState(value);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || value < 3 || matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(value);
    ran.current = true;
    const t0 = performance.now();
    let raf = 0;
    const paso = (now: number) => {
      const k = Math.min(1, (now - t0) / duration), e = 1 - Math.pow(1 - k, 3);
      setN(k < 1 ? Math.round(value * e) : value);
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    setN(0);
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n.toLocaleString("es-AR")}</>;
}
