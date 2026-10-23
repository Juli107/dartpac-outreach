import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { crearDPV } from "./dpv-engine.ts";

/**
 * Verificador de correos de Dartpac: el mismo motor del Radar (formato, tipeos, dominios de prueba o temporales,
 * casillas genéricas o de proveedores viejos) más una consulta real al DNS: si el dominio no existe o no tiene
 * servidor de correo, el email no sirve. No se manda ningún correo para comprobarlo.
 */
export type VfyEstado = "valido" | "riesgoso" | "corregible" | "invalido" | "vacio" | "baja";
export type VfyMotivo = { k: string; t: string };
export type VfyResult = {
  email: string;
  normal: string;
  estado: VfyEstado;
  motivos: VfyMotivo[];
  sugerencia: string;
  flags: { rol: boolean; gratuito: boolean; desechable: boolean; tipeo: boolean; antiguo: boolean };
  mx?: Mx;
};
type Mx = "ok" | "sin-mx" | "sin-dominio" | "dudoso";

type Engine = {
  verificar(email: unknown): VfyResult;
  duplicados(lista: unknown[]): Set<string>;
  extraer(texto: string): string[];
};
const DPV = crearDPV() as Engine;

export const ESTADO_LABEL: Record<VfyEstado, string> = {
  valido: "Válido",
  riesgoso: "Riesgoso",
  corregible: "Con error de tipeo",
  invalido: "Inválido",
  vacio: "Sin email",
  baja: "Pidió la baja",
};

/** Solo las reglas locales (instantáneo, sin red). */
export function verificarLocal(email: unknown): VfyResult {
  return DPV.verificar(email);
}

export const extraerEmails = (texto: string) => DPV.extraer(texto);
export const duplicados = (lista: string[]) => DPV.duplicados(lista);

const mxCache = new Map<string, { at: number; r: Mx }>();
const DIA = 86400_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => (t = setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), ms)))]);
  } finally {
    clearTimeout(t);
  }
}

/**
 * ¿Responde el DNS? Si ni siquiera encuentra gmail.com, el problema es de la red y no de los dominios:
 * en ese caso no se descarta ninguno (mejor dudar que marcar como inválida una base entera).
 */
let dnsSano: { at: number; ok: Promise<boolean> } | null = null;
function dnsFunciona(): Promise<boolean> {
  if (!dnsSano || Date.now() - dnsSano.at > 600_000) {
    dnsSano = { at: Date.now(), ok: withTimeout(resolveMx("gmail.com"), 4000).then((m) => m.length > 0, () => false) };
  }
  return dnsSano.ok;
}

/** ¿El dominio recibe correo? MX, o en su defecto una dirección A/AAAA (correo implícito). */
async function mxDe(domain: string): Promise<Mx> {
  const hit = mxCache.get(domain);
  if (hit && Date.now() - hit.at < (hit.r === "dudoso" ? 600_000 : DIA)) return hit.r;
  let r: Mx = "dudoso";
  try {
    const mx = await withTimeout(resolveMx(domain), 4000);
    // MX nulo (RFC 7505): "." significa que el dominio declara que no recibe correo.
    r = mx.some((m) => m.exchange && m.exchange !== ".") ? "ok" : "sin-mx";
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND") r = "sin-dominio";
    else if (code === "ENODATA") {
      const a = await withTimeout(resolve4(domain), 3000).catch(() => [] as string[]);
      const aaaa = a.length ? a : await withTimeout(resolve6(domain), 3000).catch(() => [] as string[]);
      r = a.length || aaaa.length ? "ok" : "sin-mx";
    } else r = "dudoso";
  }
  if ((r === "sin-dominio" || r === "sin-mx") && !(await dnsFunciona())) r = "dudoso";
  mxCache.set(domain, { at: Date.now(), r });
  if (mxCache.size > 5000) mxCache.delete(mxCache.keys().next().value!);
  return r;
}

/** Verificación completa: reglas locales y, si pasa, el DNS del dominio. */
export async function verificar(email: unknown, opts: { dns?: boolean } = {}): Promise<VfyResult> {
  const r = verificarLocal(email);
  if (opts.dns === false || (r.estado !== "valido" && r.estado !== "riesgoso")) return r;
  const domain = r.normal.split("@")[1] ?? "";
  const mx = await mxDe(domain);
  if (mx === "sin-dominio") return { ...r, mx, estado: "invalido", motivos: [{ k: "dominio", t: "El dominio no existe" }, ...r.motivos] };
  if (mx === "sin-mx") return { ...r, mx, estado: "invalido", motivos: [{ k: "mx", t: "El dominio no recibe correos (no tiene servidor de correo)" }, ...r.motivos] };
  return { ...r, mx };
}

/** Verifica muchas direcciones (de a varias a la vez, con el DNS en caché por dominio). */
export async function verificarLista(emails: string[], opts: { dns?: boolean; concurrency?: number } = {}) {
  const out: VfyResult[] = new Array(emails.length);
  let i = 0;
  const worker = async () => {
    while (i < emails.length) {
      const k = i++;
      out[k] = await verificar(emails[k], opts);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 8, emails.length) }, worker));
  return out;
}

/** Campos que se guardan en el contacto. */
export function camposContacto(r: VfyResult) {
  return {
    emailStatus: r.estado === "vacio" ? null : r.estado,
    emailReason: r.motivos[0]?.t ?? null,
    emailSuggestion: r.sugerencia || null,
    emailCheckedAt: new Date(),
  };
}

/** ¿Se le puede mandar? Igual que el Radar: inválidos, con tipeo sin corregir o sin email, no. */
export function sePuedeEnviar(c: { email: string | null; emailStatus: string | null; unsubscribed?: boolean; bounced?: boolean }) {
  if (!c.email || c.unsubscribed || c.bounced) return false;
  return c.emailStatus !== "invalido" && c.emailStatus !== "corregible";
}
