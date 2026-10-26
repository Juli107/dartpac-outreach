import { NextResponse, type NextRequest } from "next/server";
import { hasSession } from "@/lib/session";

// Rutas públicas: login (también con Google), píxel de apertura, imagen de firma, baja, y los trabajos programados
// (cron, trabajador y búsqueda semanal del Radar), que se protegen con su propio secreto o el token de GitHub.
const PUBLIC = [
  /^\/login/,
  /^\/api\/t\//,
  /^\/api\/firma\//,
  /^\/api\/google\//,
  /^\/baja\//,
  /^\/api\/cron/,
  /^\/api\/radar\/worker$/,
  /^\/api\/radar\/semanal$/,
  /^\/_next\//,
  /^\/icon/,
  /^\/apple-icon/,
  /^\/logo/,
  /^\/app-\d+\.png$/,
  /^\/manifest\.webmanifest$/,
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (await hasSession(req.cookies)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!favicon.ico).*)"] };
