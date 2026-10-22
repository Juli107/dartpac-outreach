import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { authUrl, callbackUrl, googleConfigured, OAUTH_COOKIE, type GoogleMode } from "@/lib/google";
import { hasSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * Manda a Google. ?modo=login entra al panel; ?modo=conectar conecta un Gmail como remitente
 * (con ?remitente=<id> el de un perfil existente, sin él crea el perfil con los datos de Google).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const mode: GoogleMode = q.get("modo") === "conectar" ? "connect" : "login";
  const back = mode === "login" ? "/login" : "/remitentes";
  if (!googleConfigured()) return NextResponse.redirect(new URL(`${back}?error=google-sin-configurar`, req.url));
  if (mode === "connect" && !(await hasSession(req.cookies))) return NextResponse.redirect(new URL("/login", req.url));

  const senderId = mode === "connect" ? (q.get("remitente") ?? "") : "";
  const sender = senderId ? await db.sender.findUnique({ where: { id: senderId }, select: { email: true } }) : null;
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(
    authUrl({ mode, state, redirectUri: callbackUrl(req.nextUrl.origin), loginHint: sender?.email }),
  );
  res.cookies.set(OAUTH_COOKIE, [state, mode, sender ? senderId : ""].join("."), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google",
  });
  return res;
}
