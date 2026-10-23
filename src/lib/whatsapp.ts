/** Número de WhatsApp en formato internacional para Argentina (549 + área + número), o "" si no sirve. */
export function waNum(tel: string | null | undefined): string {
  let d = String(tel ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.startsWith("9") && d.length === 11) d = d.slice(1);
  // quitar el 15 después del código de área (2 a 4 dígitos)
  if (d.length === 12) {
    for (const L of [2, 3, 4]) {
      if (d.substr(L, 2) === "15") {
        d = d.slice(0, L) + d.slice(L + 2);
        break;
      }
    }
  }
  return d.length === 10 ? "549" + d : d.length >= 8 ? "54" + d : "";
}

/** Enlace que abre el chat con el mensaje ya escrito (WhatsApp Web, la app de escritorio o la del teléfono). */
export function waLink(num: string, text?: string) {
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** WhatsApp de un contacto: el número de WhatsApp si lo tiene, si no el teléfono. */
export function contactWa(c: { whatsapp?: string | null; phone?: string | null }) {
  return waNum(c.whatsapp) || waNum(c.phone);
}
