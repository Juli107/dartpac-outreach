/** Períodos de la página de Analíticas (parámetro ?p=). */
export const PERIODOS = [
  { key: "todo", label: "Todo" },
  { key: "90d", label: "90 días" },
  { key: "30d", label: "30 días" },
] as const;

export function periodo(p?: string | null) {
  return PERIODOS.find((x) => x.key === p) ?? PERIODOS[0];
}

export function desdePeriodo(p?: string | null) {
  const days = { todo: 0, "90d": 90, "30d": 30 }[periodo(p).key];
  return days ? new Date(Date.now() - days * 86400_000) : undefined;
}
