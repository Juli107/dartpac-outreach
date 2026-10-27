// Alta de los remitentes del equipo (sin contraseña: cada uno se conecta con Google desde Remitentes).
// No crea secuencias ni contactos de ejemplo: las secuencias las arma el equipo. Ejecuta: npm run db:seed
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// El WhatsApp solo se completa si todavía está vacío: lo que cambien en Remitentes no se pisa.
const senders = [
  ["Luis Mendieta", "luis@plupackembalajes.com", "+54 9 11 7039-6659"],
  ["Ailén Nardone", "ailen@plupackembalajes.com", "+54 9 11 6217-3737"],
  ["Julián Cuello", "julian@plupackembalajes.com", "+54 9 11 3389-4270"],
  ["Enzo Ayala", "enzo@plupackembalajes.com", "+54 9 11 7125-7103"],
];

async function main() {
  for (const [name, email, whatsapp] of senders) {
    await db.sender.upsert({ where: { email }, update: {}, create: { name, email, whatsapp } });
    await db.sender.updateMany({ where: { email, whatsapp: "" }, data: { whatsapp } });
  }
}

main().finally(() => db.$disconnect());
