/**
 * Qué funciona mejor: tasa de respuesta por variable (hilo o correo nuevo, paso, remitente, día, hora, provincia…).
 * Funciones puras sobre una fila por email enviado, para poder probarlas sin base de datos.
 */

/** Un email enviado, con todo lo que se puede comparar y la respuesta que le tocó (si hubo). */
export type Envio = {
  id: string;
  contactId: string;
  messageId: string;
  sentAt: Date;
  timeZone: string;
  /** Número de paso en la secuencia (1 = primer email). */
  step: number;
  /** Salió como respuesta en el mismo hilo (Re:) o como correo nuevo. */
  threaded: boolean;
  variant: string;
  /** Asunto y texto del paso tal como están escritos (con {{variables}}). */
  subjectTpl: string;
  bodyTpl: string;
  sender: string;
  sequence: string;
  plainText: boolean;
  opened: boolean;
  province: string | null;
  city: string | null;
  rubro: string | null;
  title: string | null;
  reply: { at: Date; label: string } | null;
};

export type Respuesta = { contactId: string; inReplyTo: string | null; receivedAt: Date; label: string };

/** Interesado o reunión: la respuesta que importa. */
export const POSITIVAS = ["INTERESTED", "MEETING"];

/** Debajo de esta cantidad de envíos un grupo no entra en el ranking (sería pura casualidad). */
export const MINIMO = 10;
/** Debajo de esta cantidad, el ranking lo muestra pero avisa que la muestra es chica. */
export const CONFIABLE = 30;

/**
 * Le asigna cada respuesta a un email: al que contesta (cabecera In-Reply-To) o, si no la trae,
 * al último email que recibió esa persona antes de responder. Cada email se queda con su primera respuesta.
 */
export function atribuir<T extends Omit<Envio, "reply">>(envios: T[], respuestas: Respuesta[]): (T & { reply: Envio["reply"] })[] {
  const out = envios.map((e) => ({ ...e, reply: null as Envio["reply"] }));
  const porMessageId = new Map(out.map((e) => [e.messageId, e]));
  const porContacto = new Map<string, typeof out>();
  for (const e of out) porContacto.set(e.contactId, [...(porContacto.get(e.contactId) ?? []), e]);
  for (const lista of porContacto.values()) lista.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  for (const r of [...respuestas].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())) {
    let e = r.inReplyTo ? porMessageId.get(r.inReplyTo) : undefined;
    if (!e) e = (porContacto.get(r.contactId) ?? []).filter((x) => x.sentAt <= r.receivedAt).at(-1);
    if (e && !e.reply) e.reply = { at: r.receivedAt, label: r.label };
  }
  return out;
}

export type Grupo = { key: string; label: string; sent: number; replied: number; positive: number; rate: number; positiveRate: number };

export type Variable = {
  id: string;
  nombre: string;
  /** La pregunta que responde, en palabras simples. */
  pregunta: string;
  /** null = este email no entra en esta comparación. */
  clave: (e: Envio) => string | null;
  /** Orden fijo de los grupos (días, franjas…); si falta, se ordenan por tasa. */
  orden?: string[];
};

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const FRANJAS = ["Antes de las 8 h", "8 a 10 h", "10 a 12 h", "12 a 14 h", "14 a 16 h", "16 a 19 h", "Después de las 19 h"];
const LARGOS = ["Corto (menos de 50 palabras)", "Medio (50 a 100)", "Largo (100 a 150)", "Muy largo (más de 150)"];
export const SIN_DATO = "Sin dato";

function local(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour };
}

export function franja(hour: number) {
  if (hour < 8) return FRANJAS[0];
  if (hour < 10) return FRANJAS[1];
  if (hour < 12) return FRANJAS[2];
  if (hour < 14) return FRANJAS[3];
  if (hour < 16) return FRANJAS[4];
  if (hour < 19) return FRANJAS[5];
  return FRANJAS[6];
}

export function palabras(text: string) {
  return text.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
}

function largo(n: number) {
  return n < 50 ? LARGOS[0] : n < 100 ? LARGOS[1] : n < 150 ? LARGOS[2] : LARGOS[3];
}

function texto(v: string | null) {
  const t = v?.trim().replace(/\s+/g, " ");
  if (!t) return SIN_DATO;
  // «buenos AIRES» y «Buenos Aires» son el mismo grupo
  return t
    .toLocaleLowerCase("es")
    .split(" ")
    .map((w, i) => (i > 0 && ["de", "del", "la", "las", "los", "y", "e"].includes(w) ? w : w[0].toLocaleUpperCase("es") + w.slice(1)))
    .join(" ");
}

function corto(s: string, n = 48) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export const VARIABLES: Variable[] = [
  {
    id: "hilo",
    nombre: "Seguimiento en el hilo o correo nuevo",
    pregunta: "En los seguimientos (paso 2 en adelante), ¿contestan más si respondo en el mismo hilo o si mando un correo nuevo?",
    clave: (e) => (e.step < 2 ? null : e.threaded ? "En el mismo hilo (Re:)" : "Correo nuevo"),
  },
  {
    id: "paso",
    nombre: "Paso de la secuencia",
    pregunta: "¿En qué email contestan más: el primero, el segundo, el tercero…?",
    clave: (e) => `Paso ${e.step}`,
    orden: Array.from({ length: 20 }, (_, i) => `Paso ${i + 1}`),
  },
  { id: "remitente", nombre: "Remitente", pregunta: "¿A quién le contestan más?", clave: (e) => e.sender },
  {
    id: "variante",
    nombre: "Asunto y texto (variantes A/B)",
    pregunta: "De las versiones de cada email, ¿cuál consigue más respuestas?",
    clave: (e) => `Paso ${e.step} · ${e.variant}${e.threaded ? " (en el hilo)" : `: «${corto(e.subjectTpl || "sin asunto")}»`}`,
  },
  {
    id: "dia",
    nombre: "Día de envío",
    pregunta: "¿Qué día de la semana conviene enviar?",
    clave: (e) => DIAS[local(e.sentAt, e.timeZone).day],
    orden: [...DIAS.slice(1), DIAS[0]],
  },
  {
    id: "hora",
    nombre: "Hora de envío",
    pregunta: "¿A qué hora del día conviene enviar? (hora de la secuencia)",
    clave: (e) => franja(local(e.sentAt, e.timeZone).hour),
    orden: FRANJAS,
  },
  { id: "provincia", nombre: "Provincia del contacto", pregunta: "¿En qué provincias contestan más?", clave: (e) => texto(e.province) },
  { id: "ciudad", nombre: "Ciudad del contacto", pregunta: "¿En qué ciudades contestan más?", clave: (e) => texto(e.city) },
  { id: "rubro", nombre: "Rubro de la empresa", pregunta: "¿Qué rubros contestan más? (los que vienen del Radar)", clave: (e) => texto(e.rubro) },
  { id: "cargo", nombre: "Cargo del contacto", pregunta: "¿Qué cargos contestan más?", clave: (e) => texto(e.title) },
  {
    id: "largo",
    nombre: "Largo del email",
    pregunta: "¿Contestan más a los emails cortos o a los largos?",
    clave: (e) => largo(palabras(e.bodyTpl)),
    orden: LARGOS,
  },
  {
    id: "personalizado",
    nombre: "Asunto personalizado",
    pregunta: "¿Ayuda poner el nombre o la empresa en el asunto?",
    clave: (e) => (e.threaded ? null : /\{\{/.test(e.subjectTpl) ? "Con nombre o empresa en el asunto" : "Asunto igual para todos"),
  },
  {
    id: "pregunta",
    nombre: "Asunto con pregunta",
    pregunta: "¿Contestan más si el asunto es una pregunta?",
    clave: (e) => (e.threaded ? null : e.subjectTpl.includes("?") ? "Asunto con pregunta" : "Asunto sin pregunta"),
  },
  {
    id: "formato",
    nombre: "Solo texto o con diseño",
    pregunta: "¿Contestan más a los emails de solo texto o a los que llevan diseño (HTML)?",
    clave: (e) => (e.plainText ? "Solo texto" : "Con diseño (HTML)"),
  },
  {
    id: "apertura",
    nombre: "Abrió el email",
    pregunta: "De los que abren el email, ¿cuántos contestan? (no cuenta los de solo texto, que no miden aperturas)",
    clave: (e) => (e.plainText ? null : e.opened ? "Lo abrió" : "No consta que lo abriera"),
  },
  { id: "secuencia", nombre: "Secuencia", pregunta: "¿Qué secuencia consigue más respuestas?", clave: (e) => e.sequence },
];

export function rate(part: number, total: number) {
  return total ? (part / total) * 100 : 0;
}

export function agrupar(envios: Envio[], v: Variable): Grupo[] {
  const map = new Map<string, Grupo>();
  for (const e of envios) {
    const key = v.clave(e);
    if (key === null) continue;
    const g = map.get(key) ?? { key, label: key, sent: 0, replied: 0, positive: 0, rate: 0, positiveRate: 0 };
    g.sent++;
    if (e.reply) g.replied++;
    if (e.reply && POSITIVAS.includes(e.reply.label)) g.positive++;
    map.set(key, g);
  }
  const grupos = [...map.values()].map((g) => ({ ...g, rate: rate(g.replied, g.sent), positiveRate: rate(g.positive, g.sent) }));
  if (v.orden) return grupos.sort((a, b) => idx(v.orden!, a.key) - idx(v.orden!, b.key));
  return grupos.sort((a, b) => b.rate - a.rate || b.sent - a.sent);
}

function idx(orden: string[], k: string) {
  const i = orden.indexOf(k);
  return i < 0 ? orden.length : i;
}

export type Ganador = {
  variable: Variable;
  mejor: Grupo;
  /** El grupo que le sigue, para comparar. */
  segundo: Grupo;
  /** Cuántas veces la tasa del promedio de esa variable (1,5 = 50 % más). */
  veces: number;
  chico: boolean;
};

/**
 * Ranking de variables: en cada una, el grupo con más respuestas (con al menos MINIMO envíos y otro grupo para
 * comparar), ordenado por cuánto supera al promedio de esa variable. "Sin dato" no compite.
 */
export function ranking(envios: Envio[]): Ganador[] {
  const out: Ganador[] = [];
  for (const v of VARIABLES) {
    const grupos = agrupar(envios, v);
    const total = grupos.reduce((s, g) => s + g.sent, 0);
    const resp = grupos.reduce((s, g) => s + g.replied, 0);
    const comparables = grupos.filter((g) => g.sent >= MINIMO && g.key !== SIN_DATO).sort((a, b) => b.rate - a.rate || b.sent - a.sent);
    if (comparables.length < 2 || !resp) continue;
    const [mejor, segundo] = comparables;
    if (mejor.rate === segundo.rate) continue;
    const promedio = rate(resp, total);
    out.push({ variable: v, mejor, segundo, veces: promedio ? mejor.rate / promedio : 0, chico: mejor.sent < CONFIABLE || segundo.sent < CONFIABLE });
  }
  return out.sort((a, b) => Number(a.chico) - Number(b.chico) || b.veces - a.veces);
}

export const TRAMOS = ["Menos de 1 hora", "1 a 4 horas", "4 a 24 horas", "1 a 3 días", "Más de 3 días"];

/** Cuánto tardan en contestar: reparto por tramos y la mediana en horas. */
export function tiempos(envios: Envio[]) {
  const horas = envios.filter((e) => e.reply).map((e) => (e.reply!.at.getTime() - e.sentAt.getTime()) / 3600_000).sort((a, b) => a - b);
  const tramos = TRAMOS.map((label) => ({ label, n: 0 }));
  for (const h of horas) tramos[h < 1 ? 0 : h < 4 ? 1 : h < 24 ? 2 : h < 72 ? 3 : 4].n++;
  const mediana = horas.length ? (horas.length % 2 ? horas[(horas.length - 1) / 2] : (horas[horas.length / 2 - 1] + horas[horas.length / 2]) / 2) : null;
  return { tramos, mediana, total: horas.length };
}

/** "45 min", "6 h", "2,5 días". */
export function duracion(horas: number) {
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 24) return `${horas.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
  return `${(horas / 24).toLocaleString("es-AR", { maximumFractionDigits: 1 })} días`;
}

/** Una fila por email para descargar y analizar en Excel. */
export function csvEnvios(envios: (Envio & { email: string; company: string })[]) {
  const cols: [string, (e: (typeof envios)[number]) => string | number][] = [
    ["fecha_envio", (e) => e.sentAt.toISOString()],
    ["dia", (e) => DIAS[local(e.sentAt, e.timeZone).day]],
    ["hora_local", (e) => local(e.sentAt, e.timeZone).hour],
    ["secuencia", (e) => e.sequence],
    ["remitente", (e) => e.sender],
    ["paso", (e) => e.step],
    ["tipo_envio", (e) => (e.threaded ? "mismo hilo" : "correo nuevo")],
    ["variante", (e) => e.variant],
    ["asunto", (e) => e.subjectTpl],
    ["palabras", (e) => palabras(e.bodyTpl)],
    ["solo_texto", (e) => (e.plainText ? "si" : "no")],
    ["abrio", (e) => (e.plainText ? "" : e.opened ? "si" : "no")],
    ["email", (e) => e.email],
    ["empresa", (e) => e.company],
    ["cargo", (e) => e.title ?? ""],
    ["rubro", (e) => e.rubro ?? ""],
    ["provincia", (e) => e.province ?? ""],
    ["ciudad", (e) => e.city ?? ""],
    ["respondio", (e) => (e.reply ? "si" : "no")],
    ["fecha_respuesta", (e) => e.reply?.at.toISOString() ?? ""],
    ["horas_hasta_respuesta", (e) => (e.reply ? Math.round(((e.reply.at.getTime() - e.sentAt.getTime()) / 3600_000) * 10) / 10 : "")],
    ["tipo_respuesta", (e) => e.reply?.label ?? ""],
  ];
  const q = (v: string | number) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(([h]) => h).join(","), ...envios.map((e) => cols.map(([, f]) => q(f(e))).join(","))].join("\n");
}
