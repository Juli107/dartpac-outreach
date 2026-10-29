import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { YO_COOKIE } from "@/lib/yo";

/** Cerrar sesión: borra la sesión y quién era, y vuelve a la pantalla de entrada (para que entre otro usuario). */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(YO_COOKIE);
  return res;
}
