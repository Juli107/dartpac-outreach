"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Vuelve a pedir la página una sola vez, pasado el tiempo: para mostrar el resultado de algo que corre por detrás. */
export function RefrescarEn({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.refresh(), ms);
    return () => clearTimeout(t);
  }, [router, ms]);
  return null;
}
