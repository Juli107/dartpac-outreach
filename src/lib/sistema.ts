import { db } from "./db";
import { getDoc, setDoc } from "./radar/store";

/**
 * Puente con DARTPAC SISTEMA. Los dos viven en la misma base (Neon): el sistema guarda sus documentos en la tabla
 * `sis_docs` (col, id, data jsonb, v, deleted, seq, t). Desde acá:
 *  - se leen sus clientes para no escribirles como si fueran prospectos (Radar, Contactos y secuencias),
 *  - se da de alta un cliente nuevo cuando un prospecto compra,
 *  - y se sigue lo que pasa en el sistema (cotizaciones y ventas) para mover la etapa del prospecto.
 * Si la tabla no existe (base de prueba), todo sigue andando sin el sistema.
 */

export const SISTEMA_URL = (process.env.SISTEMA_URL || "https://sistema.plupackembalajes.com").replace(/\/$/, "");

type Cli = { id: string; nombre: string; cuit: string; email: string; telefono: string };
export type IndiceSistema = {
  clientes: Map<string, Cli>;
  cuits: Map<string, string>;
  emails: Map<string, string>;
  doms: Map<string, string>;
  tels: Map<string, string>;
  noms: Map<string, string>;
};

const GENERICOS = new Set(
  "gmail.com hotmail.com hotmail.com.ar yahoo.com yahoo.com.ar outlook.com outlook.com.ar live.com live.com.ar icloud.com me.com msn.com fibertel.com.ar arnet.com.ar speedy.com.ar ciudad.com.ar uolsinectis.com.ar aol.com protonmail.com gmx.com".split(" "),
);

export const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
/** Igual que nomNorm del Radar: sin acentos, puntos ni «S.A.», «S.R.L.» y parecidos. */
export const nomNorm = (s: unknown) =>
  norm(s).replace(/[.,()]/g, " ").replace(/\b(s ?a|s ?r ?l|s ?a ?s|s ?h|srl|sa|sas|ltda|coop)\b/g, " ").replace(/\s+/g, " ").trim();
export const soloDig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
/** Teléfono comparable: los últimos 10 números (código de área + número), sin 54, 9, 0 ni 15. */
export function telKey(s: unknown) {
  let d = soloDig(s);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9") && d.length === 11) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  // 11 15 1234-5678 → 11 1234-5678
  const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
  if (m && (m[1] + m[2]).length === 10) d = m[1] + m[2];
  return d.length >= 8 ? d.slice(-10) : "";
}
export function dominio(s: unknown) {
  const t = norm(s);
  if (!t) return "";
  const em = t.match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  let h = em ? em[1] : t.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0];
  h = h.replace(/^www\./, "").replace(/:\d+$/, "");
  return /\.[a-z]{2,}$/.test(h) && !GENERICOS.has(h) ? h : "";
}

let cache: { t: number; idx: IndiceSistema } | null = null;

/** Clientes del sistema (5 min en memoria). */
export async function indiceSistema(force = false): Promise<IndiceSistema> {
  if (!force && cache && Date.now() - cache.t < 5 * 60_000) return cache.idx;
  const idx: IndiceSistema = { clientes: new Map(), cuits: new Map(), emails: new Map(), doms: new Map(), tels: new Map(), noms: new Map() };
  try {
    const rows = await db.$queryRawUnsafe<{ id: string; data: Record<string, unknown> }[]>(
      `SELECT id, data FROM sis_docs WHERE col = 'clientes' AND NOT deleted AND data IS NOT NULL`,
    );
    for (const r of rows) {
      const d = r.data || {};
      if (d.baja === true || d.inactivo === true) continue;
      const c: Cli = {
        id: r.id,
        nombre: String(d.nombre || d.razonSocial || ""),
        cuit: soloDig(d.cuit),
        email: norm(d.email),
        telefono: String(d.telefono || ""),
      };
      idx.clientes.set(r.id, c);
      if (c.cuit.length === 11) idx.cuits.set(c.cuit, r.id);
      for (const e of String(d.email || "").split(/[,;\s]+/).map(norm).filter((x) => x.includes("@"))) {
        idx.emails.set(e, r.id);
        const dm = dominio(e);
        if (dm) idx.doms.set(dm, r.id);
      }
      const dw = dominio(d.web);
      if (dw) idx.doms.set(dw, r.id);
      for (const t of [d.telefono, d.whatsapp, d.tel2, d.celular]) {
        for (const p of String(t || "").split(/[,;/]|\s{2,}| y /)) {
          const k = telKey(p);
          if (k) idx.tels.set(k, r.id);
        }
      }
      for (const n of [d.nombre, d.razonSocial, d.fantasia]) {
        const k = nomNorm(n);
        if (k.length >= 5) idx.noms.set(k, r.id);
      }
    }
  } catch (e) {
    // sin tabla sis_docs (base de prueba) o sin conexión: se sigue sin el sistema
    if (!String((e as Error)?.message || "").includes("sis_docs")) console.error("sistema: clientes", e);
  }
  cache = { t: Date.now(), idx };
  return idx;
}

export type Datos = {
  nombre?: unknown; company?: unknown; email?: unknown; telefono?: unknown; phone?: unknown;
  whatsapp?: unknown; web?: unknown; website?: unknown; cuit?: unknown;
};

/** ¿Este prospecto o contacto ya es cliente del sistema? Devuelve el cliente o null. */
export function buscarCliente(idx: IndiceSistema, x: Datos): { id: string; nombre: string; por: string } | null {
  const hit = (id: string | undefined, por: string) => {
    const c = id ? idx.clientes.get(id) : null;
    return c ? { id: c.id, nombre: c.nombre, por } : null;
  };
  const cuit = soloDig(x.cuit);
  if (cuit.length === 11 && idx.cuits.has(cuit)) return hit(idx.cuits.get(cuit), "CUIT");
  const em = norm(x.email);
  if (em && idx.emails.has(em)) return hit(idx.emails.get(em), "email");
  for (const t of [x.telefono, x.phone, x.whatsapp]) {
    const k = telKey(t);
    if (k && idx.tels.has(k)) return hit(idx.tels.get(k), "teléfono");
  }
  for (const s of [x.email, x.web, x.website]) {
    const dm = dominio(s);
    if (dm && idx.doms.has(dm)) return hit(idx.doms.get(dm), "web");
  }
  for (const n of [x.nombre, x.company]) {
    const k = nomNorm(n);
    if (k.length >= 5 && idx.noms.has(k)) return hit(idx.noms.get(k), "nombre");
  }
  return null;
}

let ultimaSync = 0;

/**
 * Pasa al Radar la lista de clientes del sistema (config/excluir) para que no los trate como prospectos, y mueve la
 * etapa de los prospectos dados de alta según lo que pasa en el sistema: si tienen una cotización, «Cotizado»; si
 * tienen un pedido o una factura, «Cliente». Corre como mucho una vez cada 10 minutos.
 */
export async function sincronizarSistema(force = false) {
  if (!force && Date.now() - ultimaSync < 10 * 60_000) return;
  ultimaSync = Date.now();
  try {
    const idx = await indiceSistema(true);
    if (!idx.clientes.size) return;
    const ex = {
      clientes: [...idx.noms.keys()].sort(),
      tels: [...idx.tels.keys()].sort(),
      emails: [...idx.emails.keys()].sort(),
      cuits: [...idx.cuits.keys()].sort(),
      doms: [...idx.doms.keys()].sort(),
      origen: "DARTPAC SISTEMA",
      n: idx.clientes.size,
    };
    const prev = await getDoc("config", "excluir");
    const igual = (k: keyof typeof ex) => JSON.stringify((prev?.data as Record<string, unknown> | undefined)?.[k] ?? null) === JSON.stringify(ex[k]);
    if (!prev || !(["clientes", "tels", "emails", "cuits", "doms"] as const).every(igual)) await setDoc("config", "excluir", { ...ex, t: Date.now() });
    await etapasDesdeSistema();
  } catch (e) {
    console.error("sincronizar sistema", e);
  }
}

const ORDEN = ["nuevo", "contactado", "respondio", "cotizado", "cliente"];

/** Prospectos con alta en el sistema: la cotización los pasa a «Cotizado» y el pedido o la factura a «Cliente». */
async function etapasDesdeSistema() {
  const pros = await db.$queryRawUnsafe<{ id: string; sis: string; etapa: string | null }[]>(
    `SELECT id, data->'alta'->>'sisId' AS sis, data->>'etapa' AS etapa FROM "RadarDoc"
     WHERE col = 'prospectos' AND NOT deleted AND data->'alta'->>'sisId' IS NOT NULL`,
  );
  if (!pros.length) return;
  const ids = [...new Set(pros.map((p) => p.sis))];
  let docs: { cid: string; tipo: string | null; col: string }[] = [];
  try {
    docs = await db.$queryRawUnsafe<{ cid: string; tipo: string | null; col: string }[]>(
      `SELECT DISTINCT data->>'clienteId' AS cid, data->>'tipo' AS tipo, col FROM sis_docs
       WHERE NOT deleted AND col IN ('ventasDocs', 'pedidos') AND data->>'clienteId' = ANY($1::text[])
         AND coalesce(data->>'estado', '') NOT IN ('anulado', 'anulada', 'cancelado')`,
      ids,
    );
  } catch {
    return;
  }
  const meta = new Map<string, string>();
  for (const d of docs) {
    const et = d.col === "pedidos" || (d.tipo && d.tipo !== "cot") ? "cliente" : "cotizado";
    if (ORDEN.indexOf(et) > ORDEN.indexOf(meta.get(d.cid) || "nuevo")) meta.set(d.cid, et);
  }
  for (const p of pros) {
    const et = meta.get(p.sis);
    const actual = p.etapa || "nuevo";
    if (!et || actual === "descartado" || ORDEN.indexOf(et) <= ORDEN.indexOf(actual)) continue;
    const d = await getDoc("prospectos", p.id);
    if (!d) continue;
    const h = Array.isArray(d.data.historial) ? d.data.historial : [];
    const upd: Record<string, unknown> = {
      ...d.data,
      etapa: et,
      actualizado: Date.now(),
      historial: [...h, { t: Date.now(), tipo: "etapa", texto: et === "cliente" ? "Pasó a Cliente: compró en DARTPAC SISTEMA" : "Pasó a Cotizado: se le cotizó en DARTPAC SISTEMA", por: "DARTPAC SISTEMA" }],
    };
    if (et === "cliente") {
      upd.proximo = "";
      if (!d.data.clienteEl) upd.clienteEl = Date.now();
    }
    await setDoc("prospectos", p.id, upd);
  }
}

const nuevoId = () => {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  const r = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(r, (b) => a[b % 36]).join("");
};

/**
 * Da de alta en el sistema al prospecto que compró. Si ya existe un cliente con el mismo CUIT, email, teléfono, web
 * o nombre, no lo duplica: lo vincula. Devuelve el id del cliente en el sistema.
 */
export async function altaEnSistema(p: Record<string, unknown>, vendedor: string): Promise<{ id: string; nuevo: boolean; nombre: string }> {
  const idx = await indiceSistema(true);
  const ya = buscarCliente(idx, p);
  if (ya) return { id: ya.id, nuevo: false, nombre: ya.nombre };
  const s = (v: unknown) => String(v ?? "").trim();
  const contacto = [s(p.contacto), s(p.contactoNombre)].find(Boolean) || "";
  const data: Record<string, unknown> = {
    nombre: s(p.nombre) || "Cliente sin nombre",
    cuit: soloDig(p.cuit),
    telefono: s(p.whatsapp) || s(p.telefono),
    contacto,
    cargo: s(p.cargo),
    email: norm(p.email),
    direccion: s(p.direccion),
    localidad: s(p.localidad || p.ciudad),
    provincia: s(p.provincia),
    zona: "",
    condicion: "contado",
    plazo: 0,
    notas: [s(p.rubro) ? `Rubro: ${s(p.rubro)}` : "", s(p.web) ? `Web: ${s(p.web)}` : "", "Alta desde DARTPAC Outreach (Radar)."].filter(Boolean).join(" · "),
    prioridad: "normal",
    vendedor: s(vendedor),
    listaPrecio: "Mayorista",
    origen: "outreach",
    radarId: s(p.id),
    creado: Date.now(),
  };
  const id = nuevoId();
  await db.$executeRawUnsafe(`INSERT INTO sis_docs (col, id, data) VALUES ('clientes', $1, $2::jsonb)`, id, JSON.stringify(data));
  cache = null;
  return { id, nuevo: true, nombre: String(data.nombre) };
}

/** ¿Hay un cliente del sistema con este contacto? (para las secuencias: no escribirle). */
export async function esClienteSistema(x: Datos) {
  return buscarCliente(await indiceSistema(), x);
}
