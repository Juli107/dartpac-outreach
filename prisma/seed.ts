// Alta de los remitentes del equipo (sin contraseña: cada uno se conecta con Google desde Remitentes).
// No crea secuencias ni contactos de ejemplo: las secuencias las arma el equipo. Ejecuta: npm run db:seed
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const senders = [
  ["Luis Mendieta", "luis@plupackembalajes.com"],
  ["Ailén Nardone", "ailen@plupackembalajes.com"],
  ["Julián Cuello", "julian@plupackembalajes.com"],
  ["Enzo Ayala", "enzo@plupackembalajes.com"],
];

async function main() {
  for (const [name, email] of senders) {
    await db.sender.upsert({ where: { email }, update: {}, create: { name, email } });
  }
}

main().finally(() => db.$disconnect());
