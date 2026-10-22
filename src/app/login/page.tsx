import Image from "next/image";
import { login } from "./actions";
import { TiltCard } from "./TiltCard";
import { googleConfigured, allowedDomain } from "@/lib/google";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const google = googleConfigured();
  const passwordError = error === "1";
  const googleError = error && !passwordError ? (error === "google-sin-configurar" ? "El acceso con Google aún no está configurado." : error) : null;
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
          {google && (
            <>
              <a
                href="/api/google/start?modo=login"
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white py-2.5 font-semibold text-[#1F1F1F] shadow-lg shadow-black/20 transition hover:bg-navy-50 active:scale-[0.99]"
              >
                <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
                  <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
                </svg>
                Entrar con Google
              </a>
              <p className="mt-2 text-center text-xs text-white/50">Solo cuentas @{allowedDomain()}</p>
              <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-white/40">
                <span className="h-px flex-1 bg-white/15" />o con contraseña<span className="h-px flex-1 bg-white/15" />
              </div>
            </>
          )}
          {googleError && <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{googleError}</p>}
          <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/70">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus={!google}
            autoComplete="current-password"
            className="w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
          />
          {passwordError && <p className="mt-2 text-sm text-red-300">La contraseña no es correcta.</p>}
          <button
            className={`mt-6 w-full rounded-xl py-2.5 font-semibold shadow-lg shadow-black/20 transition active:scale-[0.99] ${
              google ? "border border-white/25 bg-white/10 text-white hover:bg-white/20" : "bg-white text-navy hover:bg-navy-50"
            }`}
          >
            Entrar
          </button>
        </form>
      </TiltCard>
    </div>
  );
}
