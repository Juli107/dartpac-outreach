import GEO from "./geo.json";
import CENSO from "./censo2022.json";

/**
 * Datos fijos del Radar para el servidor: provincias, rubros, regiones, partidos/departamentos/comunas
 * (límites del IGN) y localidades (GeoNames). Se generan desde la misma fuente que usa el mapa.
 */
type Prov = { n: string; c: string; r: string[] };
type Rub = { n: string; i: string; p: string[] };
export type Dep = { i: number; prov: string; c: string; n: string; km2: number; b?: string[] };
export type Loc = { n: string; p: number; d: number; cap: number };

export const PROV = GEO.PROV as Record<string, Prov>;
export const RUB = GEO.RUB as Record<string, Rub>;
export const GENERALES = GEO.GENERALES as string[];
export const FUENTES = GEO.FUENTES as { k: string; t: string; d: string }[];
export const FUENTES_DEF = GEO.FUENTES_DEF as string[];
export const DEPS: Dep[] = (GEO.D as unknown[][]).map((d, i) => ({ i, prov: d[0] as string, c: d[1] as string, n: d[2] as string, km2: d[3] as number, b: d[4] as string[] | undefined }));
export const LOCS: Loc[] = (GEO.L as unknown[][]).map((l) => ({ n: l[0] as string, p: l[1] as number, d: l[2] as number, cap: l[3] as number }));
export const REGIONES = (GEO.R as unknown[][]).map((r) => ({ id: r[0] as string, n: r[1] as string, desc: r[2] as string, provs: r[3] as string[], deps: r[4] as number[] }));

export const provNom = (id: string | undefined | null) => (id && PROV[id]?.n) || "Sin provincia";
export const rubNom = (id: string | undefined | null) => (id && RUB[id]?.n) || RUB.otro?.n || "Otro rubro";
export const rubrosProv = (id: string) => {
  const P = PROV[id]?.r ?? [];
  return [...P, ...GENERALES.filter((r) => !P.includes(r))];
};
export const depTipo = (prov: string) => (prov === "bsas" ? "Partido" : prov === "caba" ? "Comuna" : "Departamento");

export const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const locsDe = (() => {
  const m = new Map<number, number[]>();
  LOCS.forEach((l, j) => m.set(l.d, [...(m.get(l.d) ?? []), j]));
  return m;
})();

/** Índice nombre → partido por provincia (partidos, barrios porteños y localidades), igual que el mapa. */
const ADMI = (() => {
  const I: Record<string, Map<string, number>> = {};
  const add = (pv: string, k: string, i: number) => {
    const m = (I[pv] ??= new Map());
    if (k && !m.has(k)) m.set(k, i);
  };
  DEPS.forEach((d) => {
    add(d.prov, norm(d.n), d.i);
    (d.b ?? []).forEach((b) => add("caba", norm(b), d.i));
  });
  LOCS.forEach((l) => add(DEPS[l.d].prov, norm(l.n), l.d));
  return I;
})();

const ZLIMPIA = (s: string) =>
  norm(s)
    .replace(/^(partido|ciudad autonoma|ciudad|localidad|departamento|depto\.?|dpto\.?|municipio|barrio|b°)\s+(de\s+)?/, "")
    .replace(/\s+(oeste|este|norte|sur|centro)$/, "")
    .trim();

export function depDeTexto(pv: string, txt: unknown): number {
  const m = ADMI[pv];
  if (!m || !txt) return -1;
  const t = norm(txt);
  if (m.has(t)) return m.get(t)!;
  for (const s of String(txt).split(/[(),/;]|\s-\s|\sy\s/)) {
    const k = ZLIMPIA(s);
    if (k && m.has(k)) return m.get(k)!;
    const k2 = k.replace(/^(villa|ciudad)\s+/, "");
    if (k2 && m.has(k2)) return m.get(k2)!;
  }
  return -1;
}

/** Partido/departamento de una empresa del Radar (por su ciudad o su dirección), o -1. */
export function depDeP(p: { provincia?: unknown; ciudad?: unknown; direccion?: unknown }): number {
  const pv = String(p.provincia ?? "");
  let d = depDeTexto(pv, p.ciudad);
  if (d < 0) d = depDeTexto(pv, p.direccion);
  return d;
}

/** Habitantes por partido o departamento (por código INDEC), según el Censo 2022. */
const HAB_DEP = CENSO.d as Record<string, number>;

/** Habitantes de un partido: los del Censo 2022 y, si no está (Islas del Atlántico Sur), la suma de sus localidades. */
export const habitantes = (i: number) => HAB_DEP[DEPS[i]?.c ?? ""] ?? (locsDe.get(i) ?? []).reduce((s, j) => s + LOCS[j].p, 0);

/** Lo que guarda una búsqueda por cada partido a recorrer (mismo formato que arma el Radar). */
export function depDoc(i: number) {
  const d = DEPS[i];
  const x: { c: string; n: string; t: string; locs: string[]; b?: string[] } = {
    c: d.c,
    n: d.n,
    t: depTipo(d.prov),
    locs: (locsDe.get(i) ?? []).slice(0, 12).map((j) => LOCS[j].n),
  };
  if (d.b) x.b = d.b;
  return x;
}
