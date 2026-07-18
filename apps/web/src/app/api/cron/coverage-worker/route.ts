import { NextResponse } from "next/server";
import { coverageWorkerTick } from "@/lib/server/seed-coverage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The coverage worker heartbeat: claims a bounded number of coverage tasks,
 * executes allowed discovery, hands batches to the 0087 pipeline, and
 * checkpoints. Safe to run every few minutes; ticks are idempotent, task
 * claiming is FOR UPDATE SKIP LOCKED, and budget exhaustion pauses the run
 * instead of failing it. One tick never assumes it can finish a country.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await coverageWorkerTick(
    `cron-${new Date().toISOString().slice(0, 16)}`,
  );
  return NextResponse.json(result);
}
