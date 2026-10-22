import type { MetadataRoute } from "next";

/** Permite instalar la app en el escritorio o el móvil ("Instalar Dartpac Outreach" en Chrome/Edge). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dartpac Outreach",
    short_name: "Outreach",
    description: "Secuencias de email, contactos y respuestas para el equipo comercial de Dartpac.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B2545",
    theme_color: "#0B2545",
    lang: "es",
    icons: [
      { src: "/app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-512.png", sizes: "512x512", type: "image/png" },
      { src: "/app-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
