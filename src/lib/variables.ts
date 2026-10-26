import { db } from "./db";
import { CLAVE_VALIDA, MI_EMPRESA, RESERVADAS, VARIABLES_CONTACTO, VARIABLES_ENVIO, VARIABLES_FRECUENTES, type Variables } from "./template";

/** Lo que muestran los chips del editor: la variable y para qué sirve. */
export type VarChip = { clave: string; ayuda: string };

const SI_FALTA_PERMITIDAS = new Set([...VARIABLES_CONTACTO, ...VARIABLES_ENVIO].map(([k]) => k).filter((k) => k !== "saludo"));

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Ordena y limpia lo guardado (o lo que manda el editor): descarta lo vacío, lo repetido y lo que no es válido. */
export function normalizarVariables(v: unknown): Variables {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const vistas = new Set<string>();
  const propias = (Array.isArray(o.propias) ? o.propias : [])
    .map((p) => ({ clave: texto((p as { clave?: unknown })?.clave, 30).toLowerCase(), valor: texto((p as { valor?: unknown })?.valor, 500) }))
    .filter((p) => CLAVE_VALIDA.test(p.clave) && !RESERVADAS.has(p.clave) && p.valor && !vistas.has(p.clave) && vistas.add(p.clave))
    .slice(0, 40);
  const siFalta: Record<string, string> = {};
  const sf = (o.siFalta && typeof o.siFalta === "object" ? o.siFalta : {}) as Record<string, unknown>;
  for (const [k, val] of Object.entries(sf)) {
    const t = texto(val, 120);
    if (SI_FALTA_PERMITIDAS.has(k) && t) siFalta[k] = t;
  }
  const s = (o.saludo && typeof o.saludo === "object" ? o.saludo : {}) as Record<string, unknown>;
  const saludo = { manana: texto(s.manana, 40), tarde: texto(s.tarde, 40), noche: texto(s.noche, 40) };
  return { propias, siFalta, saludo };
}

/** Las variables del equipo (vacías si todavía no cargaron ninguna). */
export async function cargarVariables(): Promise<Variables> {
  const s = await db.setting.findUnique({ where: { id: "app" }, select: { variables: true } }).catch(() => null);
  return normalizarVariables(s?.variables);
}

/** Chips del editor: las de siempre y después las propias del equipo. */
export function chipsDeVariables(vars: Variables): VarChip[] {
  const ayuda = new Map([...VARIABLES_CONTACTO, ...VARIABLES_ENVIO]);
  const mi = vars.propias?.find((p) => p.clave === "mi_empresa")?.valor ?? MI_EMPRESA();
  const fijas = VARIABLES_FRECUENTES.map((k) => ({ clave: k, ayuda: k === "mi_empresa" ? mi : ayuda.get(k) ?? k }));
  const propias = (vars.propias ?? []).filter((p) => p.clave !== "mi_empresa").map((p) => ({ clave: p.clave, ayuda: p.valor }));
  return [...fijas, ...propias];
}

/** Nombres de las propias, para no marcarlas como desconocidas. */
export const clavesPropias = (vars: Variables) => (vars.propias ?? []).map((p) => p.clave);
