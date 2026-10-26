import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Dartpac Outreach", template: "%s · Dartpac Outreach" },
  description: "Secuencias de email, contactos y respuestas para el equipo comercial de Dartpac.",
  applicationName: "Dartpac Outreach",
  appleWebApp: { capable: true, title: "Outreach", statusBarStyle: "black-translucent" },
  // Los íconos salen de los archivos de app/: favicon.ico e icon.png (la «D» de Dartpac, para la pestaña) y apple-icon.png.
  // No declarar `icons` acá: si se declara, Next deja de agregar el ícono de la pestaña.
};

export const viewport: Viewport = { themeColor: "#0B2545" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
