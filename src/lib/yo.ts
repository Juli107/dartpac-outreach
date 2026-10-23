import { cookies } from "next/headers";
import { db } from "./db";
import { signId, verifyId } from "./tokens";

/**
 * Quién usa este navegador: se recuerda al entrar con Google (email firmado en una cookie). Sirve para elegir de
 * entrada el buzón y la firma de esa persona en el Radar. Con la contraseña común no se sabe quién es.
 */
export const YO_COOKIE = "dartpac_yo";

export function yoCookie(email: string, name: string) {
  const v = Buffer.from(JSON.stringify({ e: email, n: name })).toString("base64url");
  return {
    name: YO_COOKIE,
    value: `${v}.${signId(v)}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  };
}

export async function quienSoy(): Promise<{ email: string; name: string; senderId: string | null } | null> {
  const raw = (await cookies()).get(YO_COOKIE)?.value;
  if (!raw) return null;
  const [v, sig] = raw.split(".");
  if (!v || !sig || !verifyId(v, sig)) return null;
  try {
    const { e, n } = JSON.parse(Buffer.from(v, "base64url").toString("utf8")) as { e: string; n: string };
    const sender = await db.sender.findUnique({ where: { email: e }, select: { id: true, name: true } });
    return { email: e, name: sender?.name ?? n ?? e.split("@")[0], senderId: sender?.id ?? null };
  } catch {
    return null;
  }
}
