"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { sessionToken, SESSION_COOKIE } from "@/lib/session";

export async function login(form: FormData) {
  const given = Buffer.from(String(form.get("password") ?? "").trim());
  const expected = Buffer.from(process.env.APP_PASSWORD ?? "");
  if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    redirect("/login?error=1");
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/");
}
