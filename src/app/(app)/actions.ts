"use server";

import { revalidatePath } from "next/cache";
import { runDueSteps } from "@/lib/engine";
import { syncInbox } from "@/lib/inbox";
import { setSendingEnabled } from "@/lib/settings";

export async function runNow() {
  await syncInbox().catch(() => null);
  await runDueSteps();
  revalidatePath("/", "layout");
}

export async function toggleSending(enabled: boolean) {
  await setSendingEnabled(enabled);
  revalidatePath("/", "layout");
}
