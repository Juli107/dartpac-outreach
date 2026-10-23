export type TemplateContact = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  city?: string | null;
  province?: string | null;
  website?: string | null;
  phone?: string | null;
};

/** Datos del envío que no son del contacto: quién manda, cuándo y en qué zona horaria. */
export type TemplateContext = { sender?: { name: string } | null; now?: Date; timeZone?: string };

const FIELDS: Record<string, (c: TemplateContact, x: TemplateContext) => string | null | undefined> = {
  nombre: (c) => c.firstName,
  apellido: (c) => c.lastName,
  empresa: (c) => c.company,
  cargo: (c) => c.title,
  email: (c) => c.email,
  ciudad: (c) => c.city,
  provincia: (c) => c.province,
  web: (c) => c.website?.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
  telefono: (c) => c.phone,
  saludo: (_c, x) => saludo(x.now ?? new Date(), x.timeZone),
  vendedor: (_c, x) => x.sender?.name.split(/\s+/)[0],
  mi_empresa: () => process.env.COMPANY_NAME ?? "Plupack Embalajes",
};

export const TEMPLATE_VARIABLES = Object.keys(FIELDS);

/** Variables con su explicación, para las ayudas del editor. */
export const VARIABLE_HELP: [string, string][] = [
  ["saludo", "Buenos días / Buenas tardes, según la hora del envío"],
  ["nombre", "Nombre de la persona (si se conoce)"],
  ["empresa", "Nombre de la empresa"],
  ["ciudad", "Ciudad o localidad"],
  ["provincia", "Provincia"],
  ["cargo", "Cargo de la persona"],
  ["vendedor", "Tu nombre (el de quien envía)"],
  ["mi_empresa", "Plupack Embalajes"],
  ["web", "Web de la empresa"],
];

/** "Buenos días", "Buenas tardes" o "Buenas noches" según la hora local del envío. */
export function saludo(now: Date, timeZone = process.env.SEND_TIMEZONE ?? "America/Argentina/Buenos_Aires") {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  return h >= 6 && h < 13 ? "Buenos días" : h >= 13 && h < 20 ? "Buenas tardes" : "Buenas noches";
}

/**
 * Sustituye {{variable}} por el dato del contacto o del envío.
 * Admite un valor por defecto: {{nombre|hola}} usa "hola" si el contacto no tiene nombre.
 */
export function renderTemplate(text: string, contact: TemplateContact, ctx: TemplateContext = {}): string {
  return text.replace(/\{\{\s*([a-zñ_]+)\s*(?:\|([^}]*))?\}\}/gi, (match, key: string, fallback?: string) => {
    const getter = FIELDS[key.toLowerCase()];
    if (!getter) return match;
    const value = getter(contact, ctx)?.trim();
    return value || fallback?.trim() || "";
  });
}

/** Devuelve las variables usadas que no existen, para avisar al editar un paso. */
export function unknownVariables(text: string): string[] {
  const found = [...text.matchAll(/\{\{\s*([a-zñ_]+)/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(found.filter((k) => !FIELDS[k]))];
}
