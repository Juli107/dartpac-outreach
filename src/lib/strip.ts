/** Saca el texto nuevo de una respuesta, sin la cita del correo original. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^(El|On) .+(escribió|wrote):\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*(Original Message|Mensaje original)/i.test(line.trim())) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}
