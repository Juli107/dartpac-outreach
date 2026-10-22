import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Falta SESSION_SECRET en el entorno");
  return s;
}

/** Firma corta para enlaces públicos (baja de un contacto). */
export function signId(id: string): string {
  return createHmac("sha256", secret()).update(id).digest("base64url").slice(0, 22);
}

export function verifyId(id: string, sig: string): boolean {
  const expected = Buffer.from(signId(id));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
