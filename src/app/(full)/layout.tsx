import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

/** Secciones a pantalla completa (el Radar con su mapa): la misma barra lateral, sin márgenes. */
export default function FullLayout({ children }: { children: React.ReactNode }) {
  return <AppShell full>{children}</AppShell>;
}
