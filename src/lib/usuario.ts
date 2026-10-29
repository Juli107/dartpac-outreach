import type { Prisma } from "@prisma/client";
import { quienSoy } from "./yo";

/**
 * Quién está usando la app. Cada vendedor entra con su cuenta de Google y ve sus clientes (y los libres); el
 * administrador ve y reparte todo. La contraseña común del panel entra como administrador (no dice quién es).
 */
export type Usuario = { email: string; name: string; senderId: string | null; admin: boolean };

/** Emails con permiso de administrador (ADMIN_EMAILS en Vercel, separados por comas). */
export function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "julian@plupackembalajes.com").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export const esAdminEmail = (email: string) => adminEmails().includes(email.trim().toLowerCase());

export const ADMIN_CONTRASENA: Usuario = { email: "", name: "Administrador", senderId: null, admin: true };

export async function usuarioActual(): Promise<Usuario> {
  const yo = await quienSoy().catch(() => null);
  if (!yo) return ADMIN_CONTRASENA;
  return { ...yo, admin: esAdminEmail(yo.email) };
}

export const primerNombre = (n: string | null | undefined) => String(n ?? "").trim().split(/\s+/)[0] ?? "";

/** Los contactos que ve este usuario: el administrador todos; un vendedor los suyos y los libres. */
export function alcanceContactos(u: Usuario): Prisma.ContactWhereInput {
  if (u.admin) return {};
  return { OR: [{ ownerId: null }, ...(u.senderId ? [{ ownerId: u.senderId }] : [])] };
}
