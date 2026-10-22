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

/** Ancho al que se muestra la imagen: las exportadas a doble resolución se ven nítidas en pantallas retina. */
export function displayWidth(mode: string, width: number) {
  if (mode === "FULL") return Math.min(480, width >= 800 ? Math.round(width / 2) : width);
  return Math.min(64, width);
}

/**
 * Firma en texto y en HTML. El HTML usa tablas y estilos en línea, que es lo único que
 * respetan Gmail, Outlook y Apple Mail; la imagen se enlaza desde la app, no se adjunta.
 * `extra` es el texto libre de la firma ya con las variables sustituidas.
 */
export function renderSignature(s: SignatureSender, company: string, baseUrl: string, extra = s.signature) {
  const roleLine = [s.jobTitle, company].filter(Boolean).join(" · ");
  const text = [s.name, roleLine, [s.phone, s.website && siteLabel(s.website)].filter(Boolean).join(" · "), extra.trim()]
    .filter(Boolean)
    .join("\n");

  const img = s.signatureImageType && s.signatureImageWidth && s.signatureImageHeight
    ? (() => {
        const w = displayWidth(s.signatureImageMode, s.signatureImageWidth);
        const h = Math.round((s.signatureImageHeight * w) / s.signatureImageWidth);
        const radius = s.signatureImageMode === "FULL" ? 0 : 12;
        return `<img src="${baseUrl}/api/firma/${s.id}?v=${s.signatureImageVersion}" width="${w}" height="${h}" alt="${esc(`${s.name} · ${company}`)}" style="display:block;border:0;border-radius:${radius}px;width:${w}px;height:${h}px">`;
      })()
    : "";

  if (img && s.signatureImageMode === "FULL") {
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
