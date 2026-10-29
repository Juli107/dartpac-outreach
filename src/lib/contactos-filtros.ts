import type { Prisma } from "@prisma/client";

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

export type BusquedaContactos = { q?: string; tag?: string; f?: string };

export function filtroContactos(f?: string) {
  return FILTROS_CONTACTOS.find(([k]) => k === f) ?? FILTROS_CONTACTOS[0];
}

/** El texto buscado y la etiqueta, sin el filtro de arriba. */
export function busquedaContactos(b: BusquedaContactos): Prisma.ContactWhereInput {
  const q = b.q?.trim();
  return {
    ...(q ? { OR: ["email", "firstName", "lastName", "company", "city", "province", "phone", "whatsapp"].map((f) => ({ [f]: { contains: q, mode: "insensitive" } })) } : {}),
    ...(b.tag ? { tags: { has: b.tag } } : {}),
  };
}

export function whereContactos(b: BusquedaContactos): Prisma.ContactWhereInput {
  return { AND: [busquedaContactos(b), filtroContactos(b.f)[2]] };
}
