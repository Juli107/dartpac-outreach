import { NextResponse } from "next/server";
import { registrarYo } from "@/lib/actividad";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Lo que pedimos de cada lugar (Google cobra según estos campos). */
const CAMPOS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

type Lugar = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
};

/** «Av. Colón 1234, X5000 Córdoba, Argentina» → «Córdoba». */
function ciudadDe(dir: string) {
  const p = dir.split(",").map((x) => x.trim()).filter(Boolean);
  if (p.length < 2) return "";
  return p[p.length - 2].replace(/^[A-Z]?\d{4}[A-Z]{0,3}\s+/, "").trim();
}

/**
 * Búsqueda en Google Maps con la API oficial de Google Places: «distribuidora de descartables» en una provincia.
 * Devuelve hasta 60 lugares con nombre, dirección, teléfono y web. Sin la clave GOOGLE_MAPS_API_KEY avisa que falta.
 */
export async function POST(req: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: "sin_clave" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { q?: string; zona?: string };
  const q = String(body.q ?? "").trim().slice(0, 120);
  const zona = String(body.zona ?? "").trim().slice(0, 80);
  if (!q) return NextResponse.json({ error: "Escribí qué buscar." }, { status: 400 });
  const textQuery = `${q}${zona ? ` en ${zona}` : ""}, Argentina`;

  const lugares: Lugar[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": CAMPOS },
      body: JSON.stringify({ textQuery, languageCode: "es", regionCode: "AR", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    const j = (await r.json().catch(() => ({}))) as { places?: Lugar[]; nextPageToken?: string; error?: { message?: string } };
    if (!r.ok) {
      if (lugares.length) break;
      return NextResponse.json({ error: j.error?.message ?? `Google respondió ${r.status}` }, { status: 502 });
    }
    lugares.push(...(j.places ?? []));
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }

  const res = lugares
    .filter((l) => l.businessStatus !== "CLOSED_PERMANENTLY")
    .map((l) => ({
      id: l.id,
      nombre: l.displayName?.text ?? "",
      direccion: l.formattedAddress ?? "",
      ciudad: ciudadDe(l.formattedAddress ?? ""),
      telefono: l.nationalPhoneNumber ?? l.internationalPhoneNumber ?? "",
      web: l.websiteUri ?? "",
      maps: l.googleMapsUri ?? "",
    }))
    .filter((l) => l.nombre);
  await registrarYo("busqueda", `Buscó en Google Maps: ${textQuery} (${res.length} lugares)`);
  return NextResponse.json({ q: textQuery, lugares: res });
}
