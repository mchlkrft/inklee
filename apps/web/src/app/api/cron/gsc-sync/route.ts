import { NextResponse } from "next/server";
import { runScheduledSync } from "@/lib/gsc/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

// Daily Google Search Console sync (growth cockpit acquisition layer).
// Re-fetches a rolling 10-day window of finalized source dates (late-final
// data self-corrects) and advances any running backfill by one bounded batch.
// Idempotent: every write is a primary-key upsert; a lock on the connection
// prevents overlapping runs.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runScheduledSync();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
