export const SESSION_COOKIE = "dartpac_session";

/** Token de sesión derivado de la contraseña: cambiarla cierra todas las sesiones. Funciona en Edge. */
export async function sessionToken() {
  const data = new TextEncoder().encode(`${process.env.APP_PASSWORD}:${process.env.SESSION_SECRET}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hasSession(cookies: { get(name: string): { value: string } | undefined }) {
  const value = cookies.get(SESSION_COOKIE)?.value;
  return !!value && value === (await sessionToken());
}

/** Cookie de sesión de 30 días, la misma para contraseña y para Google. */
export async function sessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: await sessionToken(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };
}
