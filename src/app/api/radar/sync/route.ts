import { NextResponse } from "next/server";
import { changesSince } from "@/lib/radar/store";

export const dynamic = "force-dynamic";

/** Cambios de la base del Radar desde `since` (ms del servidor). Con since=0 trae todo. */
export async function GET(req: Request) {
  const since = Number(new URL(req.url).searchParams.get("since") || 0) || 0;
  const out = await changesSince(since);
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
