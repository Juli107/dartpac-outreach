export type TemplateContact = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
};

const FIELDS: Record<string, (c: TemplateContact) => string | null | undefined> = {
  nombre: (c) => c.firstName,
  apellido: (c) => c.lastName,
  empresa: (c) => c.company,
  cargo: (c) => c.title,
  email: (c) => c.email,
};

export const TEMPLATE_VARIABLES = Object.keys(FIELDS);

/**
 * Sustituye {{variable}} por el dato del contacto.
 * Admite un valor por defecto: {{nombre|hola}} usa "hola" si el contacto no tiene nombre.
 */
export function renderTemplate(text: string, contact: TemplateContact): string {
  return text.replace(/\{\{\s*([a-zñ]+)\s*(?:\|([^}]*))?\}\}/gi, (match, key: string, fallback?: string) => {
    const getter = FIELDS[key.toLowerCase()];
    if (!getter) return match;
    const value = getter(contact)?.trim();
    return value || fallback?.trim() || "";
  });
}

/** Devuelve las variables usadas que no existen, para avisar al editar un paso. */
export function unknownVariables(text: string): string[] {
  const found = [...text.matchAll(/\{\{\s*([a-zñ]+)/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(found.filter((k) => !FIELDS[k]))];
}
