/** Rebotes: rechazos del servidor al enviar y avisos de "mailer-daemon" que llegan a la bandeja. */

/** Rechazo permanente de la dirección (5.1.x): reintentar no sirve y daña la reputación del buzón. */
export function isHardBounce(error: string) {
  return /\b5\.1\.[0-9]\b|\b55[03]\b.*(user|mailbox|recipient|address)|user unknown|no such user|does not exist/i.test(error);
}

/** Avisos de entrega fallida de Gmail y otros servidores. */
export function isBounceSender(from: string) {
  return /^(mailer-daemon|postmaster)@/i.test(from);
}

/** Direcciones que el aviso de rebote da como fallidas (cabecera estándar o texto del aviso). */
export function bouncedAddresses(text: string, failedHeader?: string) {
  const found = new Set<string>();
  for (const a of (failedHeader ?? "").split(/[\s,]+/)) if (a.includes("@")) found.add(a.toLowerCase());
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) found.add(m[0].toLowerCase());
  return [...found].filter((a) => !isBounceSender(a));
}
