/** Variantes de un email para probar asuntos y textos (A/B/C…). La A es el propio paso. */
export type Variant = { label: string; subject: string; body: string };

export function stepVariants(step: { subject: string; body: string; variants?: Variant[] }): Variant[] {
  const extra = [...(step.variants ?? [])].sort((a, b) => a.label.localeCompare(b.label));
  return [{ label: "A", subject: step.subject, body: step.body }, ...extra];
}

/** Elige siempre la misma variante para un contacto y un paso, repartiendo a partes iguales. */
export function pickVariant<T extends Variant>(key: string, variants: T[]): T {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return variants[(h >>> 0) % variants.length];
}

/** Siguiente letra libre (B, C, D…). */
export function nextVariantLabel(used: string[]) {
  for (let c = 66; c <= 90; c++) {
    const l = String.fromCharCode(c);
    if (!used.includes(l)) return l;
  }
  return null;
}

/** Día de la secuencia en que sale cada paso (el primero es el día 1). */
export function stepDays(steps: { delayDays: number }[]) {
  let day = 1;
  return steps.map((s) => (day += s.delayDays));
}
