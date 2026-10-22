/** Añade la firma de la secuencia al final del email, separada por una línea en blanco. */
export function withSignature(body: string, signature: string) {
  return signature.trim() ? `${body.trimEnd()}\n\n${signature.trim()}` : body;
}
