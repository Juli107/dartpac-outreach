import Image from "next/image";
import { login } from "./actions";
import { TiltCard } from "./TiltCard";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login-bg relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="login-blob login-blob-a" aria-hidden />
      <div className="login-blob login-blob-b" aria-hidden />
      <div className="login-blob login-blob-c" aria-hidden />
      <div className="login-grid" aria-hidden />

      <TiltCard>
        <form action={login} className="relative">
          <div className="login-logo mb-7 flex justify-center">
            <Image src="/logo-dartpac-blanco.png" alt="Dartpac" width={150} height={78} priority />
          </div>
          <h1 className="text-center text-xl text-white">Dartpac Outreach</h1>
          <p className="mb-6 mt-1 text-center text-sm text-white/60">Secuencias, contactos y respuestas en un solo lugar.</p>
          <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/70">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            className="w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
          />
          {error && <p className="mt-2 text-sm text-red-300">La contraseña no es correcta.</p>}
          <button className="mt-6 w-full rounded-xl bg-white py-2.5 font-semibold text-navy shadow-lg shadow-black/20 transition hover:bg-navy-50 active:scale-[0.99]">
            Entrar
          </button>
        </form>
      </TiltCard>
    </div>
  );
}
