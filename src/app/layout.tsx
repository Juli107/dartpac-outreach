import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Dartpac Outreach", template: "%s · Dartpac Outreach" },
  description: "Secuencias de email, contactos y respuestas para el equipo comercial de Dartpac.",
  applicationName: "Dartpac Outreach",
  appleWebApp: { capable: true, title: "Outreach", statusBarStyle: "black-translucent" },
  icons: { apple: "/app-192.png" },
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
