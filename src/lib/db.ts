import { PrismaClient } from "@prisma/client";

// La imagen de la firma solo la lee /api/firma; el resto de consultas no carga esos bytes.
const createClient = () => new PrismaClient({ omit: { sender: { signatureImage: true } } });

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
