import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

const ISSUER = "https://token.actions.githubusercontent.com";
export const OIDC_AUDIENCE = "dartpac-outreach";

let keys: { at: number; list: (JsonWebKey & { kid?: string })[] } | null = null;

async function jwks() {
  if (!keys || Date.now() - keys.at > 3600_000) {
    const res = await fetch(`${ISSUER}/.well-known/jwks`);
    if (!res.ok) throw new Error(`JWKS de GitHub: ${res.status}`);
    keys = { at: Date.now(), list: (await res.json()).keys };
  }
  return keys.list;
}

const b64 = (s: string) => Buffer.from(s, "base64url");

/**
 * Comprueba un token OIDC de GitHub Actions: firma RS256 de GitHub, audiencia de esta app,
 * vigente y emitido para el repositorio indicado. Así el cron no necesita ningún secreto.
 */
export async function verifyGithubOidc(token: string, repository: string) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return false;
  const header = JSON.parse(b64(h).toString());
  if (header.alg !== "RS256") return false;
  const jwk = (await jwks()).find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const ok = verify("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), b64(s));
  if (!ok) return false;
  const claims = JSON.parse(b64(p).toString());
  const now = Date.now() / 1000;
  return (
    claims.iss === ISSUER &&
    claims.aud === OIDC_AUDIENCE &&
    claims.repository === repository &&
    claims.exp > now &&
    claims.nbf <= now + 60
  );
}
