// Actualiza las tablas de Outreach solo si se pide (OUTREACH_DB_PUSH=1 en Vercel).
// Outreach comparte la base Neon con DARTPAC Sistema, que tiene sus propias tablas (sis_docs, sis_blobs).
// `prisma db push` querría borrarlas por no estar en este esquema: corre solo cuando se cambia el esquema
// a propósito, y nunca acepta pérdida de datos.
import { execSync } from "node:child_process";

if (process.env.OUTREACH_DB_PUSH === "1") {
  console.log("db-push: actualizando las tablas de Outreach (sin aceptar pérdida de datos)…");
  execSync("prisma db push --skip-generate", { stdio: "inherit" });
} else {
  console.log("db-push: omitido (las tablas ya están al día). Para un cambio de esquema, OUTREACH_DB_PUSH=1.");
}
