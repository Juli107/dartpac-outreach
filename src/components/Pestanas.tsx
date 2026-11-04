import Link from "next/link";

/** Pestañas que unen secciones hermanas en una sola: el Tablero (Panel, Equipo, Envíos) y el Correo (Remitentes, Buzones). */
const GRUPOS = {
  tablero: [
    { href: "/", label: "Resumen" },
    { href: "/equipo", label: "Equipo" },
    { href: "/envios", label: "Envíos" },
  ],
  correo: [
    { href: "/remitentes", label: "Remitentes" },
    { href: "/buzones", label: "Buzones y salud del correo" },
  ],
} as const;

export function Pestanas({ grupo, activa }: { grupo: keyof typeof GRUPOS; activa: string }) {
  return (
    <nav aria-label="Secciones" className="seg">
      {GRUPOS[grupo].map((p) => (
        <Link key={p.href} href={p.href} aria-current={p.href === activa ? "page" : undefined} className="seg-item">
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
