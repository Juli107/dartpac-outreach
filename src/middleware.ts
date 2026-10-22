import { NextResponse, type NextRequest } from "next/server";
import { sessionToken, SESSION_COOKIE } from "@/lib/session";

// Rutas públicas: login, píxel de apertura, baja y cron (que se protege con su propio secreto).
const PUBLIC = [/^\/login/, /^\/api\/t\//, /^\/baja\//, /^\/api\/cron/, /^\/_next\//, /^\/icon/, /^\/logo/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken())) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!favicon.ico).*)"] };
