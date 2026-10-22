import Image from "next/image";
import { login } from "./actions";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center bg-navy px-4">
      <form action={login} className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl">
        <div className="mb-6 flex justify-center rounded-xl bg-navy py-5">
          <Image src="/logo-dartpac-blanco.png" alt="Dartpac" width={150} height={78} priority />
        </div>
        <label htmlFor="password" className="label">Contraseña</label>
        <input id="password" name="password" type="password" required autoFocus className="input" />
        {error && <p className="mt-2 text-sm text-red-700">La contraseña no es correcta.</p>}
        <button className="btn mt-5 w-full justify-center">Entrar</button>
      </form>
    </div>
  );
}
