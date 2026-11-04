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

/** ¿Es celular? Solo cuando se nota: +54 9…, o el 15 después del código de área. Un fijo no tiene WhatsApp. */
export function esCelular(tel: string | null | undefined): boolean {
  let d = String(tel ?? "").replace(/\D/g, "");
  if (!d) return false;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9") && d.length === 11) return true;
  if (d.startsWith("0")) d = d.slice(1);
  return d.length === 12 && [2, 3, 4].some((L) => d.substr(L, 2) === "15");
}

/** WhatsApp de un contacto: el número de WhatsApp si lo tiene, si no el teléfono. */
export function contactWa(c: { whatsapp?: string | null; phone?: string | null }) {
  return waNum(c.whatsapp) || waNum(c.phone);
}

/**
 * Verificador de WhatsApp de un contacto. «si»: tiene WhatsApp (número de WhatsApp cargado, celular, o alguien lo marcó);
 * «fijo»: el teléfono parece fijo; «no»: alguien marcó que no tiene; «sin»: no hay número que sirva.
 * Solo con «si» se ofrece mandarle WhatsApp. No se le escribe a nadie para comprobarlo.
 */
export type WaEstado = "si" | "fijo" | "no" | "sin";
export const WA_ESTADOS: Record<WaEstado, [string, "ok" | "warn" | "bad" | "neutral"]> = {
  si: ["Tiene WhatsApp", "ok"],
  fijo: ["Parece fijo", "warn"],
  no: ["Sin WhatsApp", "bad"],
  sin: ["Sin número", "neutral"],
};
export function estadoWa(c: { whatsapp?: string | null; phone?: string | null; waMarca?: string | null }): { estado: WaEstado; num: string; motivo: string } {
  const tel = waNum(c.phone);
  if (c.waMarca === "no") return { estado: "no", num: "", motivo: "Marcaron que no tiene WhatsApp" };
  const wa = waNum(c.whatsapp);
  if (wa) return { estado: "si", num: wa, motivo: "Tiene un número de WhatsApp cargado" };
  if (tel && esCelular(c.phone)) return { estado: "si", num: tel, motivo: "Es un celular (con 9 o 15)" };
  if (tel && c.waMarca === "si") return { estado: "si", num: tel, motivo: "Marcaron que tiene WhatsApp" };
  if (tel) return { estado: "fijo", num: "", motivo: "Parece un teléfono fijo: no tiene 9 ni 15. Si sabés que es celular, marcá «Tiene WhatsApp»." };
  return { estado: "sin", num: "", motivo: c.phone ? "El número está incompleto" : "No tiene teléfono" };
}

/** El WhatsApp al que se le puede escribir, o "" si el verificador dice que no tiene. */
export function contactWaCelular(c: { whatsapp?: string | null; phone?: string | null; waMarca?: string | null }) {
  return estadoWa(c).num;
}
