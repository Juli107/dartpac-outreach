import type { Prisma } from "@prisma/client";
import { alcanceContactos, type Usuario } from "./usuario";

/** Filtros de la página de Contactos (los usan la lista y «Sumar a una secuencia»). */
export const FILTROS_CONTACTOS: [string, string, Prisma.ContactWhereInput][] = [
  ["todos", "Todos", {}],
  ["radar", "Del Radar", { radarId: { not: null } }],
  ["libres", "Sin secuencia", { enrollments: { none: {} } }],
  ["abrieron", "Abrieron", { enrollments: { some: { messages: { some: { openedAt: { not: null } } } } } }],
  ["respondieron", "Respondieron", { replies: { some: {} } }],
  ["problemas", "Email con problemas", { emailStatus: { in: ["invalido", "corregible"] } }],
  ["sinemail", "Sin email", { email: null }],
  ["rebotados", "Rebotados", { bounced: true }],
  ["bajas", "Bajas", { unsubscribed: true }],
];

/**
 * `v`: de qué vendedor (su id, «mios», «libres» o vacío = todos los que puede ver). `sec`: una sección
 * («Córdoba – Luis Mendieta»).
 */
export type BusquedaContactos = { q?: string; tag?: string; f?: string; v?: string; sec?: string };

export function filtroContactos(f?: string) {
  return FILTROS_CONTACTOS.find(([k]) => k === f) ?? FILTROS_CONTACTOS[0];
}

/** El texto buscado y la etiqueta, sin el filtro de arriba. */
export function busquedaContactos(b: BusquedaContactos): Prisma.ContactWhereInput {
  const q = b.q?.trim();
  return {
    ...(q ? { OR: ["email", "firstName", "lastName", "company", "city", "province", "phone", "whatsapp"].map((f) => ({ [f]: { contains: q, mode: "insensitive" } })) } : {}),
    ...(b.tag ? { tags: { has: b.tag } } : {}),
    ...(b.sec ? { seccion: b.sec } : {}),
  };
}

/** Lo que este usuario puede ver, más el vendedor elegido arriba. */
export function delVendedor(b: BusquedaContactos, u: Usuario): Prisma.ContactWhereInput {
  const v = b.v === "mios" ? u.senderId ?? "-" : b.v;
  return { AND: [alcanceContactos(u), v === "libres" ? { ownerId: null } : v ? { ownerId: v } : {}] };
}

export function whereContactos(b: BusquedaContactos, u: Usuario): Prisma.ContactWhereInput {
  return { AND: [delVendedor(b, u), busquedaContactos(b), filtroContactos(b.f)[2]] };
}
