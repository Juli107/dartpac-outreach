import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { allowedDomain, callbackUrl, DomainError, exchangeCode, GMAIL_SCOPE, OAUTH_COOKIE, readIdToken } from "@/lib/google";
import { hasSession, sessionCookie } from "@/lib/session";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { yoCookie } from "@/lib/yo";

function sameState(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const [state = "", mode = "login", senderId = ""] = (req.cookies.get(OAUTH_COOKIE)?.value ?? "").split(".");
  const back = mode === "connect" ? "/remitentes" : "/login";
  const fail = (error: string) => {
    const res = NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent(error)}`, req.url));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/google" });
    return res;
  };

  if (!sameState(state, q.get("state") ?? "")) return fail("La sesión con Google caducó. Vuelve a intentarlo.");
  if (q.get("error")) return fail(q.get("error") === "access_denied" ? "Cancelaste el acceso en Google." : `Google: ${q.get("error")}`);
  const code = q.get("code");
  if (!code) return fail("Google no devolvió el código.");

  let tokens, profile;
  try {
    tokens = await exchangeCode(code, callbackUrl(req.nextUrl.origin));
    profile = readIdToken(tokens.id_token ?? "");
  } catch (e) {
    if (e instanceof DomainError) return fail(`Usa tu cuenta @${allowedDomain()}: ${e.email} no está permitida.`);
    return fail(e instanceof Error ? e.message : String(e));
  }

  if (mode === "login") {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/google" });
    res.cookies.set(await sessionCookie());
    // Recuerda quién entró: el Radar elige de entrada su buzón y su firma.
    res.cookies.set(yoCookie(profile.email, profile.name));
    return res;
  }

  // Conectar Gmail: solo desde una sesión ya abierta en el panel.
  if (!(await hasSession(req.cookies))) return fail("Entra al panel antes de conectar un Gmail.");
  if (!tokens.scope?.split(" ").includes(GMAIL_SCOPE)) return fail("Marca la casilla de Gmail en la pantalla de Google para poder enviar.");
  if (!tokens.refresh_token) return fail("Google no entregó permiso permanente. Vuelve a conectar.");

  if (senderId) {
    const sender = await db.sender.findUnique({ where: { id: senderId } });
    if (!sender) return fail("Ese remitente ya no existe.");
    if (sender.email !== profile.email) {
      return fail(`Entraste con ${profile.email}, pero este remitente es ${sender.email}. Elige esa cuenta en Google.`);
    }
  }
  // Conexión recién hecha: se olvida el error de la comprobación anterior.
  const google = { googleRefreshToken: encryptSecret(tokens.refresh_token), googleConnectedAt: new Date(), lastCheckError: null };
  await db.sender.upsert({
    where: { email: profile.email },
    update: google,
    create: { name: profile.name, email: profile.email, ...google },
  });

  const res = NextResponse.redirect(new URL(`/remitentes?conectado=${encodeURIComponent(profile.email)}`, req.url));
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/google" });
  return res;
}
