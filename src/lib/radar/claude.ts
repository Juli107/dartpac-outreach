/**
 * Cliente mínimo de la API de Claude (Messages) para el Radar: búsqueda en la web (web_search + web_fetch),
 * herramientas propias (guardar empresas, alertas, datos) y textos con IA. Reintenta ante saturación,
 * continúa los turnos pausados y lleva la cuenta del uso.
 */
export type Block = { type: string; [k: string]: unknown };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type Usage = { tokIn: number; tokOut: number; cacheR: number; cacheW: number; busq: number; fetch: number; usd: number };
export type ClientTool = { name: string; description: string; input_schema: Record<string, unknown>; run: (input: Record<string, unknown>) => Promise<unknown> };

const API = () => (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages";
export const modelo = () => process.env.RADAR_MODEL || "claude-sonnet-5-5";
export const modeloRapido = () => process.env.RADAR_MODEL_QUICK || "claude-haiku-5-5";
export const iaConfigurada = () => !!process.env.ANTHROPIC_API_KEY;

/** Precios por millón de tokens (US$) para estimar el gasto; se pueden ajustar por variable de entorno. */
const precio = () => ({
  in: Number(process.env.RADAR_PRICE_IN ?? 2),
  out: Number(process.env.RADAR_PRICE_OUT ?? 10),
  busq: 0.01,
});

export const usoVacio = (): Usage => ({ tokIn: 0, tokOut: 0, cacheR: 0, cacheW: 0, busq: 0, fetch: 0, usd: 0 });
export function sumarUso(a: Usage, b: Usage): Usage {
  return { tokIn: a.tokIn + b.tokIn, tokOut: a.tokOut + b.tokOut, cacheR: a.cacheR + b.cacheR, cacheW: a.cacheW + b.cacheW, busq: a.busq + b.busq, fetch: a.fetch + b.fetch, usd: +(a.usd + b.usd).toFixed(4) };
}
function usoDe(u: Record<string, unknown> | undefined): Usage {
  const n = (k: string) => Number((u ?? {})[k] ?? 0) || 0;
  const st = ((u ?? {}).server_tool_use ?? {}) as Record<string, unknown>;
  const busq = Number(st.web_search_requests ?? 0) || 0;
  const fetch = Number(st.web_fetch_requests ?? 0) || 0;
  const p = precio();
  const usd = (n("input_tokens") * p.in + n("cache_creation_input_tokens") * p.in * 1.25 + n("cache_read_input_tokens") * p.in * 0.1 + n("output_tokens") * p.out) / 1e6 + busq * p.busq;
  return { tokIn: n("input_tokens"), tokOut: n("output_tokens"), cacheR: n("cache_read_input_tokens"), cacheW: n("cache_creation_input_tokens"), busq, fetch, usd: +usd.toFixed(4) };
}

export const SIN_CREDITO =
  "Se terminó el crédito de la API de Claude de este mes. Vuelve a funcionar cuando se renueva el crédito del plan; no se cobra nada aparte.";

export class ApiError extends Error {
  constructor(public status: number, public tipo: string, message: string) {
    super(message);
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una llamada a la API, con reintentos ante 429/5xx/529 respetando retry-after. */
export async function llamar(body: Record<string, unknown>, opts: { signal?: AbortSignal; intentos?: number; hasta?: number } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ApiError(401, "sin_clave", "Falta configurar la API de Claude (ANTHROPIC_API_KEY en Vercel).");
  const intentos = opts.intentos ?? 5;
  for (let i = 0; ; i++) {
    let res: Response;
    try {
      res = await fetch(API(), {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      if (i + 1 >= intentos || (opts.hasta && Date.now() > opts.hasta)) throw new ApiError(0, "red", e instanceof Error ? e.message : String(e));
      await dormir(1500 * 2 ** i);
      continue;
    }
    if (res.ok) return (await res.json()) as { content: Block[]; stop_reason: string; usage?: Record<string, unknown> };
    const txt = await res.text();
    let tipo = "error", msg = txt.slice(0, 300);
    try {
      const j = JSON.parse(txt);
      tipo = j?.error?.type ?? tipo;
      msg = j?.error?.message ?? msg;
    } catch {}
    // Sin crédito la API frena (no cobra nada aparte): se avisa claro y en castellano, sin reintentar.
    if (/credit balance is too low/i.test(msg)) throw new ApiError(res.status, "sin_credito", SIN_CREDITO);
    const reintentable = res.status === 429 || res.status === 529 || res.status >= 500;
    if (!reintentable || i + 1 >= intentos) throw new ApiError(res.status, tipo, msg);
    const ra = Number(res.headers.get("retry-after"));
    const espera = Math.min(60_000, (ra > 0 ? ra * 1000 : 2000 * 2 ** i) + Math.random() * 800);
    if (opts.hasta && Date.now() + espera > opts.hasta) throw new ApiError(res.status, tipo, msg);
    await dormir(espera);
  }
}

// Herramientas de búsqueda del servidor de Claude. Las versiones con filtrado dinámico ahorran tokens;
// si la cuenta no las tiene, se usan las clásicas.
let clasicas = process.env.RADAR_TOOLS === "clasicas";
function herramientasWeb(o: { busquedas: number; lecturas: number; region?: string; ciudad?: string }) {
  const loc = { type: "approximate", country: "AR", timezone: "America/Argentina/Buenos_Aires", ...(o.region ? { region: o.region } : {}), ...(o.ciudad ? { city: o.ciudad } : {}) };
  return [
    { type: clasicas ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: o.busquedas, user_location: loc },
    { type: clasicas ? "web_fetch_20250910" : "web_fetch_20260209", name: "web_fetch", max_uses: o.lecturas, max_content_tokens: 6000 },
  ];
}

function conCache(messages: Msg[]): Msg[] {
  // marca de caché en el último mensaje del usuario: la ronda siguiente relee todo lo anterior a precio de caché
  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role !== "user") continue;
    const c = out[i].content;
    const blocks: Block[] = typeof c === "string" ? [{ type: "text", text: c }] : (c as Block[]).map((b) => ({ ...b }));
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
    out[i] = { role: "user", content: blocks };
    break;
  }
  return out;
}

export const textoDe = (content: Block[]) =>
  content
    .filter((b) => b.type === "text")
    .map((b) => String(b.text ?? ""))
    .join("")
    .trim();

/**
 * Conversación con herramientas: Claude busca en la web (del lado del servidor de Anthropic) y llama a nuestras
 * herramientas; seguimos hasta que termina, se acaban las rondas o el tiempo.
 */
export async function conversar(o: {
  system: string;
  user: string;
  tools: ClientTool[];
  web?: { busquedas: number; lecturas: number; region?: string; ciudad?: string };
  model?: string;
  maxTokens?: number;
  maxRondas?: number;
  hasta: number;
}): Promise<{ fin: "ok" | "tiempo" | "rondas"; texto: string; uso: Usage }> {
  let uso = usoVacio();
  const messages: Msg[] = [{ role: "user", content: o.user }];
  const defs = o.tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  let texto = "";
  for (let ronda = 0; ronda < (o.maxRondas ?? 8); ronda++) {
    if (Date.now() > o.hasta - 8000) return { fin: "tiempo", texto, uso };
    let res;
    try {
      res = await llamar(
        {
          model: o.model ?? modelo(),
          max_tokens: o.maxTokens ?? 4096,
          system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
          messages: conCache(messages),
          tools: [...(o.web ? herramientasWeb(o.web) : []), ...defs],
        },
        { hasta: o.hasta },
      );
    } catch (e) {
      // la cuenta no tiene las herramientas nuevas: se repite con las clásicas
      if (e instanceof ApiError && e.status === 400 && !clasicas && /web_(search|fetch)_2026|tool|allowed_callers|code_execution/i.test(e.message)) {
        clasicas = true;
        ronda--;
        continue;
      }
      throw e;
    }
    uso = sumarUso(uso, usoDe(res.usage));
    messages.push({ role: "assistant", content: res.content });
    const t = textoDe(res.content);
    if (t) texto = t;
    if (res.stop_reason === "pause_turn") continue;
    if (res.stop_reason === "tool_use") {
      const results: Block[] = [];
      for (const b of res.content) {
        if (b.type !== "tool_use") continue;
        const tool = o.tools.find((x) => x.name === b.name);
        let out: unknown;
        try {
          out = tool ? await tool.run((b.input ?? {}) as Record<string, unknown>) : { error: `No existe la herramienta ${String(b.name)}` };
        } catch (e) {
          out = { error: e instanceof Error ? e.message : String(e) };
        }
        results.push({ type: "tool_result", tool_use_id: b.id, content: typeof out === "string" ? out : JSON.stringify(out) });
      }
      if (results.length) messages.push({ role: "user", content: results });
      continue;
    }
    return { fin: "ok", texto, uso };
  }
  return { fin: "rondas", texto, uso };
}

/** Pedido simple de texto (o JSON) a Claude, sin herramientas: lo usan "Redactar con IA" y el Radar. */
export async function pedirTexto(prompt: string | Msg[], o: { rapido?: boolean; maxTokens?: number; json?: boolean } = {}) {
  const messages: Msg[] = typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;
  const system = o.json
    ? "Respondé únicamente con JSON válido, sin texto antes ni después y sin bloques de código."
    : "Sos un asistente comercial de Plupack Embalajes (DARTPAC), mayorista argentino de film stretch, film PVC, bolsas, embalaje y descartables. Escribí en español rioplatense, claro y sin inventar datos.";
  const res = await llamar({ model: o.rapido ? modeloRapido() : modelo(), max_tokens: o.maxTokens ?? 1500, system, messages }, { intentos: 3 });
  const text = textoDe(res.content);
  return { text, truncated: res.stop_reason === "max_tokens", uso: usoDe(res.usage) };
}

/** Saca el primer objeto o arreglo JSON de un texto (por si viene con algo alrededor). */
export function parsearJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const i = t.search(/[[{]/);
    if (i < 0) throw new Error("La IA no devolvió JSON");
    const open = t[i], close = open === "{" ? "}" : "]";
    const j = t.lastIndexOf(close);
    return JSON.parse(t.slice(i, j + 1));
  }
}
