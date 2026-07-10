// Read-only lifecycle status for the Control Tower Email hub (slice 11). Returns, per
// definition in code (drafts included, so CT sees what exists): the definition status, the
// latest run's timestamp/status/aggregates, and the all-time count of 'sent' markers; plus
// the last 20 run rows overall. AGGREGATES ONLY — never an artist id, an email address, or
// a marker row. Like the other CT read paths (email-jobs/status, email-metrics) this is a
// plain Bearer on CT_DISPATCH_SECRET, fail-closed: missing secret -> 500, mismatch -> 401.
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { LIFECYCLE_DEFINITIONS } from "@/lib/email-campaigns/lifecycle/definitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Loosely-typed run rows (the lifecycle tables are not in a generated Database type).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RunRow = any;

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

export async function POST(request: Request) {
  const secret = process.env.CT_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Per definition: an exact head count of sent markers (no rows fetched) + the latest
    // run row. Definitions are few, so the pairs run in parallel.
    const definitions = await Promise.all(
      LIFECYCLE_DEFINITIONS.map(async (def) => {
        const [sentTotalRes, lastRunRes] = await Promise.all([
          serviceClient
            .from("email_lifecycle_markers")
            .select("id", { count: "exact", head: true })
            .eq("definition_key", def.key)
            .eq("status", "sent"),
          serviceClient
            .from("email_lifecycle_runs")
            .select(
              "status, audience_size, eligible, sent_count, failed_count, skipped_count, skipped_detail, created_at",
            )
            .eq("definition_key", def.key)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (sentTotalRes.error) throw sentTotalRes.error;
        if (lastRunRes.error) throw lastRunRes.error;
        const lastRun: RunRow = lastRunRes.data;
        return {
          key: def.key,
          status: def.status,
          lastRunAt: lastRun?.created_at ?? null,
          lastRunStatus: lastRun?.status ?? null,
          sentTotal: sentTotalRes.count ?? 0,
          lastRun: lastRun
            ? {
                audience_size: num(lastRun.audience_size),
                eligible: num(lastRun.eligible),
                sent_count: num(lastRun.sent_count),
                failed_count: num(lastRun.failed_count),
                skipped_count: num(lastRun.skipped_count),
                skipped_detail: lastRun.skipped_detail ?? null,
              }
            : null,
        };
      }),
    );

    const { data: recent, error: recentErr } = await serviceClient
      .from("email_lifecycle_runs")
      .select(
        "definition_key, status, audience_size, eligible, sent_count, failed_count, skipped_count, error, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20);
    if (recentErr) throw recentErr;
    const recentRuns = ((recent ?? []) as RunRow[]).map((r) => ({
      key: r.definition_key,
      status: r.status,
      audience_size: num(r.audience_size),
      eligible: num(r.eligible),
      sent_count: num(r.sent_count),
      failed_count: num(r.failed_count),
      skipped_count: num(r.skipped_count),
      error: r.error ?? null,
      created_at: r.created_at,
    }));

    return NextResponse.json({ definitions, recentRuns });
  } catch {
    // never leak query internals
    return NextResponse.json({ error: "status failed" }, { status: 500 });
  }
}
