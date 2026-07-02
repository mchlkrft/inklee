import { NextResponse } from "next/server";
import { submitToIndexNow } from "@/lib/indexnow";

export const runtime = "nodejs";

/**
 * Manually trigger an IndexNow submission of the full canonical marketing
 * URL list. Gated by CRON_SECRET (same bearer scheme as the cron routes) so it
 * cannot be spammed publicly — repeated submissions of unchanged URLs can get
 * the host throttled. Call it after shipping marketing/SEO content changes:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://inklee.app/api/indexnow
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await submitToIndexNow();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error("[api/indexnow] submit failed", error);
    return NextResponse.json({ error: "submit_failed" }, { status: 500 });
  }
}
