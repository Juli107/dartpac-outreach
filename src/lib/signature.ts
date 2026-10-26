/** Añade la firma de la secuencia al final del email, separada por una línea en blanco. */
export function withSignature(body: string, signature: string) {
  return signature.trim() ? `${body.trimEnd()}\n\n${signature.trim()}` : body;
}

export type SignatureSender = {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  phone: string;
  website: string;
  signature: string;
  signatureImageType: string | null;
  signatureImageWidth: number | null;
  signatureImageHeight: number | null;
  signatureImageMode: string;
  signatureImageVersion: number;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif";
const INK = "#1D1D1F";
const GREY = "#6E6E73";

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function siteLabel(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function siteHref(url: string) {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

/**
 * Cómo va la imagen en la firma (`signatureImageMode`):
 * - «DATOS»: imagen chica (un logo o una foto) con nombre, cargo, empresa y contacto escritos al lado.
 * - Cualquier otro valor («IMAGEN», y los viejos «LOGO» y «FULL»): solo la imagen, sin nada escrito al lado. Así lo pidió
 *   el equipo: la imagen suele ser una firma diseñada que ya trae el nombre y los datos, y escribirlos al lado los repite.
 */
export const IMAGEN_CON_DATOS = "DATOS";
export const soloImagen = (mode: string) => mode !== IMAGEN_CON_DATOS;

/**
 * Ancho al que se muestra la imagen: las exportadas a doble resolución se ven nítidas en pantallas retina. Sola, una
 * firma ancha llega a 480 px y una cuadrada (un logo, una tarjeta) a 200 px; al lado de los datos, 64 px.
 */
export function displayWidth(mode: string, width: number, height = width) {
  if (!soloImagen(mode)) return Math.min(64, width);
  if (width < height * 1.3) return Math.min(200, width >= 400 ? Math.round(width / 2) : width);
  return Math.min(480, width >= 800 ? Math.round(width / 2) : width);
}

/**
 * Firma en texto y en HTML. El HTML usa tablas y estilos en línea, que es lo único que
 * respetan Gmail, Outlook y Apple Mail; la imagen se enlaza desde la app, no se adjunta.
 * `extra` es el texto libre de la firma ya con las variables sustituidas.
 * El texto (para los mails solo texto, donde no hay imagen) lleva siempre los datos.
 */
export function renderSignature(s: SignatureSender, company: string, baseUrl: string, extra = s.signature) {
  const roleLine = [s.jobTitle, company].filter(Boolean).join(" · ");
  const text = [s.name, roleLine, [s.phone, s.website && siteLabel(s.website)].filter(Boolean).join(" · "), extra.trim()]
    .filter(Boolean)
    .join("\n");

  const sola = soloImagen(s.signatureImageMode);
  const img = s.signatureImageType && s.signatureImageWidth && s.signatureImageHeight
    ? (() => {
        const w = displayWidth(s.signatureImageMode, s.signatureImageWidth, s.signatureImageHeight);
        const h = Math.round((s.signatureImageHeight * w) / s.signatureImageWidth);
        const radius = sola ? 0 : 12;
        return `<img src="${baseUrl}/api/firma/${s.id}?v=${s.signatureImageVersion}" width="${w}" height="${h}" alt="${esc(`${s.name} · ${company}`)}" style="display:block;border:0;border-radius:${radius}px;width:${w}px;height:${h}px">`;
      })()
    : "";

  if (img && sola) {
    return { text, html: `<div style="margin-top:20px">${img}</div>` };
  }

  const contact = [
    s.phone && `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ""))}" style="color:${GREY};text-decoration:none">${esc(s.phone)}</a>`,
    s.website && `<a href="${esc(siteHref(s.website))}" style="color:${GREY};text-decoration:none">${esc(siteLabel(s.website))}</a>`,
  ].filter(Boolean).join(` <span style="color:#D2D2D7">·</span> `);
  const lines = [
    `<div style="font-size:14px;font-weight:600;color:${INK};letter-spacing:-0.01em">${esc(s.name)}</div>`,
    roleLine && `<div style="font-size:12px;color:${GREY};margin-top:2px">${esc(roleLine)}</div>`,
    contact && `<div style="font-size:12px;color:${GREY};margin-top:8px">${contact}</div>`,
    extra.trim() && `<div style="font-size:11px;color:${GREY};margin-top:8px">${esc(extra.trim()).replace(/\n/g, "<br>")}</div>`,
  ].filter(Boolean).join("");

  const html =
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:24px;border-collapse:collapse;font-family:${FONT}"><tr>` +
    (img ? `<td style="vertical-align:top;padding:0 14px 0 0">${img}</td>` : "") +
    `<td style="vertical-align:top;padding:0 0 0 ${img ? 14 : 0}px;${img ? "border-left:1px solid #D2D2D7;" : ""}">${lines}</td>` +
    `</tr></table>`;
  return { text, html };
}

/** Minúsculas y sin tildes, letra por letra (mismo largo que el original, para poder cortarlo en el mismo lugar). */
function plegar(s: string) {
  let out = "";
  for (let i = 0; i < s.length; i++) out += ((s[i].normalize("NFD")[0] ?? s[i]).toLowerCase()[0] ?? s[i]);
  return out;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CIERRES = "saludos cordiales|saludos|un saludo|un abrazo|abrazo|atentamente|cordialmente|muchas gracias|gracias|exitos|hasta pronto";
const SEPARADOR = /^\s*(--|—|–|_{2,}|-{3,})\s*$/;

export type DatosFirma = { name: string; email: string; jobTitle?: string; phone?: string; website?: string };

/**
 * Saca del final del texto la firma que la firma del remitente ya trae, para que no llegue dos veces. Por ejemplo,
 * «Saludos,\nJulián\nPlupack Embalajes» queda «Saludos,\nJulián», y «Saludos,\nJulián Cuello | Plupack Embalajes»
 * queda «Saludos,\nJulián Cuello». Solo actúa si el bloque arranca con el nombre de quien envía y lo que sigue son
 * datos que ya están en su firma (la empresa, el cargo, su teléfono, su web o su email); el nombre solo, como
 * despedida, queda. Si el bloque viene después de un «--», se va entero.
 */
export function sinFirmaRepetida(body: string, s: DatosFirma, empresas: string[]) {
  const nombre = plegar(s.name).replace(/\s+/g, " ").trim();
  const pila = nombre.split(" ")[0] ?? "";
  if (pila.length < 2) return body;
  const web = plegar(siteLabel(s.website ?? "")).replace(/^www\./, "");
  const dominio = plegar(s.email.split("@")[1] ?? "");
  const conocidos = [
    plegar(s.email),
    web,
    dominio,
    plegar(s.jobTitle ?? ""),
    "dartpac",
    ...empresas.flatMap((e) => {
      const p = plegar(e).replace(/\s+/g, " ").trim();
      const primera = p.split(" ")[0] ?? "";
      return [p, primera.length >= 4 ? primera : ""];
    }),
  ]
    .filter((k) => k.length >= 3)
    .sort((a, b) => b.length - a.length);
  const tel = (s.phone ?? "").replace(/\D/g, "");

  /** ¿La línea (ya plegada) es solo datos de la firma? */
  const esDato = (f: string) => {
    let r = ` ${f} `.replace(/https?:\/\//g, " ");
    if (tel.length >= 7) r = r.replace(/\+?\d[\d\s().-]{5,}\d/g, (m) => (m.replace(/\D/g, "").endsWith(tel.slice(-8)) ? " " : m));
    for (const k of conocidos) r = r.split(k).join(" ");
    r = r.replace(/\b(tel|telefono|cel|celular|movil|whatsapp|wa|email|e-mail|mail|correo|web|sitio|www|de|en|y)\b/g, " ");
    return !/[a-z0-9]/.test(r);
  };

  const lines = body.replace(/\s+$/, "").split("\n");
  let i = lines.length - 1;
  let datos = 0;
  while (i >= 0 && (lines[i].trim() === "" || esDato(plegar(lines[i])))) {
    if (lines[i].trim()) datos++;
    i--;
  }
  if (i < 0) return body;
  const linea = lines[i];
  const f = plegar(linea);
  const m = new RegExp(`^\\s*(?:(?:${CIERRES})\\s*[,.:!-]?\\s+)?(?:${escRe(nombre)}|${escRe(pila)})(?![a-z0-9])`).exec(f);
  if (!m) return body;
  const resto = f.slice(m[0].length);
  if (!esDato(resto)) return body;
  const antes = lines.slice(0, i);
  // «--» y abajo el nombre: es un bloque de firma entero
  if (antes.length && SEPARADOR.test(antes[antes.length - 1])) return antes.slice(0, -1).join("\n").replace(/\s+$/, "");
  if (datos === 0 && !/[a-z0-9]/.test(resto)) return body; // el nombre solo: es la despedida, queda
  return [...antes, linea.slice(0, m[0].length).replace(/\s+$/, "")].join("\n");
}
