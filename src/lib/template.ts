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

/** Variable propia del equipo: un texto fijo que se escribe igual para todos (un link, un teléfono, una oferta). */
export type Propia = { clave: string; valor: string };

/**
 * Variables que el equipo agrega o modifica (valen para todas las secuencias): las propias, qué escribir cuando
 * al contacto le falta un dato y los textos del saludo.
 */
export type Variables = {
  propias?: Propia[];
  siFalta?: Record<string, string>;
  saludo?: { manana?: string; tarde?: string; noche?: string };
};

/** Datos del envío que no son del contacto: quién manda, cuándo, en qué zona horaria y las variables del equipo. */
export type TemplateContext = { sender?: { name: string } | null; now?: Date; timeZone?: string; vars?: Variables };

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
  saludo: (_c, x) => saludo(x.now ?? new Date(), x.timeZone, x.vars?.saludo),
  vendedor: (_c, x) => x.sender?.name.split(/\s+/)[0],
  mi_empresa: () => MI_EMPRESA(),
};

/** Nombres válidos: empiezan con letra y siguen con letras, números o guion bajo (como {{catalogo}} o {{oferta_2}}). */
export const CLAVE_VALIDA = /^[a-zñ][a-zñ0-9_]{0,29}$/;

/** Datos de cada contacto (si faltan, se escribe lo que diga «Si falta»). */
export const VARIABLES_CONTACTO: [string, string][] = [
  ["nombre", "Nombre de la persona"],
  ["apellido", "Apellido de la persona"],
  ["empresa", "Nombre de la empresa"],
  ["cargo", "Cargo de la persona"],
  ["ciudad", "Ciudad o localidad"],
  ["provincia", "Provincia"],
  ["web", "Web de la empresa"],
  ["telefono", "Teléfono"],
  ["email", "Email del contacto"],
];

/** Datos del envío. */
export const VARIABLES_ENVIO: [string, string][] = [
  ["saludo", "Buenos días / Buenas tardes / Buenas noches, según la hora del envío"],
  ["vendedor", "Nombre de quien envía (el remitente)"],
];

/** Las de siempre en los chips del editor, en este orden. */
export const VARIABLES_FRECUENTES = ["saludo", "nombre", "empresa", "ciudad", "provincia", "cargo", "web", "vendedor", "mi_empresa"];

/** Variables que existen de fábrica (salvo mi_empresa, que el equipo puede cambiar, no se pueden pisar con una propia). */
export const RESERVADAS = new Set(Object.keys(FIELDS).filter((k) => k !== "mi_empresa"));

/** Texto de fábrica de {{mi_empresa}}. */
export const MI_EMPRESA = () => process.env.COMPANY_NAME ?? "Plupack Embalajes";

/** "Buenos días", "Buenas tardes" o "Buenas noches" según la hora local del envío. */
export function saludo(now: Date, timeZone = process.env.SEND_TIMEZONE ?? "America/Argentina/Buenos_Aires", textos?: Variables["saludo"]) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  if (h >= 6 && h < 13) return textos?.manana?.trim() || "Buenos días";
  if (h >= 13 && h < 20) return textos?.tarde?.trim() || "Buenas tardes";
  return textos?.noche?.trim() || "Buenas noches";
}

const VARIABLE = /\{\{\s*([a-zñ][a-zñ0-9_]*)\s*(?:\|([^}]*))?\}\}/gi;

/**
 * Sustituye {{variable}} por el dato del contacto, del envío o de las variables propias del equipo.
 * Si falta el dato: {{nombre|hola}} usa "hola" en ese mensaje; si no, lo que el equipo haya puesto en «Si falta».
 */
export function renderTemplate(text: string, contact: TemplateContact, ctx: TemplateContext = {}): string {
  const propias = new Map((ctx.vars?.propias ?? []).map((p) => [p.clave.toLowerCase(), p.valor]));
  return text.replace(VARIABLE, (match, key: string, fallback?: string) => {
    const k = key.toLowerCase();
    const siFalta = fallback !== undefined ? fallback.trim() : ctx.vars?.siFalta?.[k]?.trim() ?? "";
    if (propias.has(k)) return propias.get(k)!.trim() || siFalta;
    const getter = FIELDS[k];
    if (!getter) return match;
    return getter(contact, ctx)?.trim() || siFalta;
  });
}

/** Devuelve las variables usadas que no existen (ni de fábrica ni propias), para avisar al editar un paso. */
export function unknownVariables(text: string, propias: string[] = []): string[] {
  const conocidas = new Set([...Object.keys(FIELDS), ...propias.map((p) => p.toLowerCase())]);
  const found = [...text.matchAll(/\{\{\s*([a-zñ][a-zñ0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(found.filter((k) => !conocidas.has(k)))];
}
