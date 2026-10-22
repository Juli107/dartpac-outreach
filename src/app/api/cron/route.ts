import { NextResponse } from "next/server";
import { runDueSteps } from "@/lib/engine";
import { syncInbox } from "@/lib/inbox";
import { verifyGithubOidc } from "@/lib/github-oidc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REPOSITORY = process.env.GITHUB_REPOSITORY ?? "Juli107/dartpac-outreach";

/** Vale el secreto CRON_SECRET (Vercel, cron-job.org) o un token OIDC del workflow de GitHub. */
async function authorized(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const token = auth.replace(/^Bearer\s+/i, "");
  return token.split(".").length === 3 && (await verifyGithubOidc(token, REPOSITORY).catch(() => false));
}

export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  // Primero las respuestas, para no enviar un seguimiento a quien acaba de contestar.
  // Con un cron cada minuto los buzones se revisan cada 5; ?bandeja=1 fuerza la revisión.
  const checkInbox = new URL(req.url).searchParams.has("bandeja") || new Date().getUTCMinutes() % 5 === 0;
  const inbox = checkInbox ? await syncInbox().catch((e) => ({ error: String(e) })) : "omitida";
  const steps = await runDueSteps();
  return NextResponse.json({ inbox, steps });
}
