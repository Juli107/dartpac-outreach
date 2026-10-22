/**
 * Inicio de sesión con Google y conexión de Gmail por OAuth (sin contraseñas de aplicación).
 * Hace falta un cliente OAuth "Aplicación web" en Google Cloud, con la pantalla de consentimiento
 * en modo Interno para el dominio de la empresa. Ver GOOGLE_CLIENT_ID en .env.example.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Acceso completo a Gmail: es el único permiso que admite SMTP e IMAP con XOAUTH2. */
export const GMAIL_SCOPE = "https://mail.google.com/";

export type GoogleMode = "login" | "connect";

/** Cookie de corta vida con el state del viaje a Google, el modo y el remitente. */
export const OAUTH_COOKIE = "dartpac_oauth";

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Solo las cuentas de este dominio pueden entrar o conectarse. */
export function allowedDomain() {
  return (process.env.GOOGLE_ALLOWED_DOMAIN ?? "plupackembalajes.com").trim().toLowerCase();
}

export function callbackUrl(origin: string) {
  return new URL("/api/google/callback", process.env.APP_URL ?? origin).toString();
}

export function authUrl(opts: { mode: GoogleMode; state: string; redirectUri: string; loginHint?: string }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: opts.redirectUri,
    response_type: "code",
    state: opts.state,
    hd: allowedDomain(),
    scope: opts.mode === "connect" ? `openid email profile ${GMAIL_SCOPE}` : "openid email profile",
  });
  if (opts.mode === "connect") {
    // offline + consent: Google entrega un refresh token, que es lo que permite enviar sin la persona delante.
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  } else {
    params.set("prompt", "select_account");
  }
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; scope?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google respondió ${res.status}: ${data.error_description ?? data.error ?? "sin detalle"}`);
  return data as TokenResponse;
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

export type GoogleProfile = { email: string; name: string };

/**
 * Lee el id_token que Google devuelve en el intercambio del código. Llega directo de Google por
 * TLS y autenticado con el secreto del cliente, así que basta con comprobar emisor, audiencia,
 * caducidad, email verificado y dominio (OpenID Connect Core 3.1.3.7).
 */
export function readIdToken(idToken: string, now = Date.now()): GoogleProfile {
  const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") throw new Error("Emisor no válido");
  if (payload.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("El token no es para esta app");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < now) throw new Error("El token caducó");
  const email = String(payload.email ?? "").toLowerCase();
  if (!email || payload.email_verified !== true) throw new Error("Google no confirmó el email");
  if (!email.endsWith(`@${allowedDomain()}`)) throw new DomainError(email);
  return { email, name: String(payload.name ?? email.split("@")[0]) };
}

export class DomainError extends Error {
  email: string;
  constructor(email: string) {
    super(`${email} no es una cuenta de ${allowedDomain()}`);
    this.email = email;
  }
}

const accessTokens = new Map<string, { token: string; until: number }>();

/** Token de acceso vigente para un refresh token (los de Google duran una hora). */
export async function accessTokenFor(refreshToken: string) {
  const cached = accessTokens.get(refreshToken);
  if (cached && cached.until > Date.now()) return cached.token;
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  accessTokens.set(refreshToken, { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 });
  return t.access_token;
}

/** Retira el permiso en Google. Si falla (ya revocado, sin red) no importa: el token se borra igual. */
export async function revokeToken(token: string) {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}
