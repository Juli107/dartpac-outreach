import type { db } from "@/lib/db";

/** Secuencia con remitente y pasos (con variantes), tal como la carga la página. */
const load = (client: typeof db, id: string) =>
  client.sequence.findUniqueOrThrow({ where: { id }, include: { sender: true, steps: { include: { variants: true } } } });
export type Seq = Awaited<ReturnType<typeof load>>;

export type TabParams = {
  tab?: string;
  paso?: string;
  variante?: string;
  filtro?: string;
  contacto?: string;
  error?: string;
  guardado?: string;
};

export const base = (id: string) => `/secuencias/${id}`;
