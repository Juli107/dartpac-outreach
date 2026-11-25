import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { sessionCookie } from "@/lib/session";
import { YO_COOKIE, yoCookie } from "@/lib/yo";

export const dynamic = "force-dynamic";

const usados = new Map<string, number>();

/**
 * Entrada desde DARTPAC SISTEMA sin otra contraseña. El sistema firma un pase de 60 s con la llave que guarda en la
 * base compartida (sis_docs, col _srv, id sso-outreach) y trae el email y el nombre del buzón de esta persona.
 * Con email entra como esa persona (sus clientes, su firma); sin email (administrador del sistema sin buzón), como
 * administrador, igual que con la contraseña común.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = url.searchParams.get("next") ?? "/radar";
  const destino = /^\/(?!\/)/.test(next) ? next : "/radar";
  const malo = () => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("El pase de DARTPAC SISTEMA venció o no es válido. Volvé a abrir Outreach desde el sistema.")}`, url));
  const [p, sig] = String(url.searchParams.get("t") ?? "").split(".");
  if (!p || !sig) return malo();
  let k = "";
  try {
    const r = await db.$queryRawUnsafe<{ k: string | null }[]>(`SELECT data->>'k' AS k FROM sis_docs WHERE col = '_srv' AND id = 'sso-outreach'`);
    k = r[0]?.k ?? "";
  } catch {
    return malo();
  }
  if (!k) return malo();
  const esperado = createHmac("sha256", k).update(p).digest("base64url");
  if (esperado.length !== sig.length || !timingSafeEqual(Buffer.from(esperado), Buffer.from(sig))) return malo();
  let d: { e?: string; n?: string; a?: boolean; x?: number; j?: string };
  try {
    d = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return malo();
  }
  const ahora = Date.now();
  if (!d.x || d.x < ahora || !d.j || usados.has(d.j)) return malo();
  usados.set(d.j, d.x);
  for (const [j, x] of usados) if (x < ahora) usados.delete(j);
  if (!d.e && !d.a) return malo();

  const res = NextResponse.redirect(new URL(destino, url));
  res.cookies.set(await sessionCookie());
  if (d.e) res.cookies.set(yoCookie(String(d.e).toLowerCase(), String(d.n ?? "")));
  else res.cookies.set({ name: YO_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
