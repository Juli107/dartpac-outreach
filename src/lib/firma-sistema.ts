import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";

/**
 * Pedidos servidor a servidor desde DARTPAC SISTEMA. El sistema firma el cuerpo con la llave que guarda en la base
 * compartida (sis_docs, col _srv, id sso-outreach) y manda `x-sis-firma: <ts>.<hmac(ts + "." + cuerpo)>`.
 * Vale 2 minutos.
 */
export async function firmaSistemaOk(req: Request, cuerpo: string) {
  const h = req.headers.get("x-sis-firma") ?? "";
  const [ts, sig] = h.split(".");
  if (!ts || !sig || Math.abs(Date.now() - Number(ts)) > 120_000) return false;
  let k = "";
  try {
    const r = await db.$queryRawUnsafe<{ k: string | null }[]>(`SELECT data->>'k' AS k FROM sis_docs WHERE col = '_srv' AND id = 'sso-outreach'`);
    k = r[0]?.k ?? "";
  } catch {
    return false;
  }
  if (!k) return false;
  const esperado = createHmac("sha256", k).update(`${ts}.${cuerpo}`).digest("base64url");
  return esperado.length === sig.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(sig));
}

/** Marca de los contactos que son clientes del sistema y se pueden escribir para reactivarlos (el motor los deja pasar). */
export const TAG_REACTIVAR = "reactivacion";
