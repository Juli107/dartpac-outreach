"use server";

import { revalidatePath } from "next/cache";
import { runDueSteps } from "@/lib/engine";
import { syncInbox } from "@/lib/inbox";

export async function runNow() {
  await syncInbox().catch(() => null);
  await runDueSteps();
  revalidatePath("/", "layout");
}
