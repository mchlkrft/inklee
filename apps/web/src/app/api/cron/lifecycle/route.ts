// Daily lifecycle email cron (Email hub slice 11). Auth is the same Bearer CRON_SECRET
// precedent as /api/cron/reminders. AFTER auth comes the kill switch: unless
// process.env.EMAIL_LIFECYCLE_ENABLED is exactly 'true' this endpoint is a complete no-op —
// it returns { disabled: true } without touching the database or Resend. With the flag on,
// the engine still only runs definitions whose status is 'active' (CT exports arrive as
// 'draft'), so enabling the flag alone sends nothing.
import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/email-campaigns/internal-auth";
import { runLifecycleEngine } from "@/lib/email-campaigns/lifecycle/engine";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.EMAIL_LIFECYCLE_ENABLED !== "true") {
    return NextResponse.json({ disabled: true });
  }

  try {
    const runs = await runLifecycleEngine();
    return NextResponse.json({ disabled: false, runs });
  } catch (e) {
    // Generic 500 — aggregates only, never internals (and never a recipient address).
    console.error("[cron/lifecycle] run failed", (e as Error)?.message);
    return NextResponse.json({ error: "lifecycle failed" }, { status: 500 });
  }
}
