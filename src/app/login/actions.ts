"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { sessionCookie } from "@/lib/session";
import { YO_COOKIE } from "@/lib/yo";
import { registrar } from "@/lib/actividad";

export async function login(form: FormData) {
  const given = Buffer.from(String(form.get("password") ?? "").trim());
  const expected = Buffer.from(process.env.APP_PASSWORD ?? "");
  if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    redirect("/login?error=1");
  }
  const jar = await cookies();
  jar.set(await sessionCookie());
  // la contraseña común entra como administrador: se olvida quién había entrado con Google en este navegador
  jar.delete(YO_COOKIE);
  await registrar({ name: "Administrador", senderId: null }, "entro", "Entró con la contraseña del panel");
  redirect("/");
}
