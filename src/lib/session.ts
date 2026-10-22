export const SESSION_COOKIE = "dartpac_session";

/** Token de sesión derivado de la contraseña: cambiarla cierra todas las sesiones. Funciona en Edge. */
export async function sessionToken() {
  const data = new TextEncoder().encode(`${process.env.APP_PASSWORD}:${process.env.SESSION_SECRET}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
