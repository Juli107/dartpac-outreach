import { Prisma } from "@prisma/client";
import { db } from "./db";
import { usuarioActual, type Usuario } from "./usuario";

/** Lo que se registra de cada usuario (las etiquetas de la página Equipo). */
export const TIPOS_ACTIVIDAD: Record<string, string> = {
  entro: "Entró",
  busqueda: "Búsqueda",
  mensaje: "Mensaje",
  mail: "Mail de secuencia",
  whatsapp: "WhatsApp de secuencia",
  secuencia: "Sumó a secuencia",
  alta: "Cargó un cliente",
  importo: "Importó",
  asigno: "Repartió clientes",
  reparto: "Reparto diario",
  bloqueo: "Bloqueado",
};

type Quien = Pick<Usuario, "name" | "senderId"> | null;

/** Anota algo que hizo un usuario. Con `ref`, lo mismo no se anota dos veces. Nunca falla. */
export async function registrar(u: Quien, tipo: string, texto: string, extra: { contactId?: string | null; ref?: string } = {}) {
  try {
    await db.actividad.create({
      data: { senderId: u?.senderId ?? null, quien: u?.name || "Sistema", tipo, texto: texto.slice(0, 500), contactId: extra.contactId ?? null, ref: extra.ref ?? null },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    console.error("registrar actividad", e);
  }
}

/** Lo mismo, para quien está usando la app ahora. */
export async function registrarYo(tipo: string, texto: string, extra: { contactId?: string | null; ref?: string } = {}) {
  await registrar(await usuarioActual(), tipo, texto, extra);
}
