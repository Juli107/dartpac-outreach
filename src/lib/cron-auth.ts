import { verifyGithubOidc } from "./github-oidc";

const REPOSITORY = process.env.GITHUB_REPOSITORY ?? "Juli107/dartpac-outreach";

/** Vale el secreto CRON_SECRET (la propia app, Vercel, cron-job.org) o un token OIDC del workflow de GitHub. */
export async function autorizadoCron(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const token = auth.replace(/^Bearer\s+/i, "");
  return token.split(".").length === 3 && (await verifyGithubOidc(token, REPOSITORY).catch(() => false));
}
