// Read-only lifecycle eligibility dry run for the Control Tower Email hub: evaluates EVERY
// definition in code (drafts included, so the audience can be previewed BEFORE activation)
// through the real send-time gate pipeline (segment, no_email, suppressed, opted_out,
// throttled, already_sent) and returns AGGREGATES ONLY. Nothing is sent, no marker or run
// row is written, Resend is never constructed; the shared evaluateDefinition is pure reads.
// Like the other CT read paths this is a plain Bearer on CT_DISPATCH_SECRET, fail-closed:
// missing secret -> 500, mismatch -> 401. Definitions evaluate sequentially so the auth
// admin lookups stay inside their bounded concurrency.
import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/email-campaigns/internal-auth";
import {
  evaluateDefinition,
  type SkippedDetail,
} from "@/lib/email-campaigns/lifecycle/engine";
import { LIFECYCLE_DEFINITIONS } from "@/lib/email-campaigns/lifecycle/definitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DryRunRow = {
  key: string;
  status: string;
  audienceSize: number | null;
  eligible: number | null;
  skipped: SkippedDetail | null;
  error: string | null;
};

export async function POST(request: Request) {
  const secret = process.env.CT_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const definitions: DryRunRow[] = [];
  for (const def of LIFECYCLE_DEFINITIONS) {
    try {
      const { audienceSize, eligible, skipped } = await evaluateDefinition(def);
      definitions.push({
        key: def.key,
        status: def.status,
        audienceSize,
        eligible: eligible.length,
        skipped,
        error: null,
      });
    } catch (e) {
      // per-definition failure never hides the others; generic message, never internals
      console.error(
        "[lifecycle-dry-run] evaluation failed",
        def.key,
        (e as Error)?.message,
      );
      definitions.push({
        key: def.key,
        status: def.status,
        audienceSize: null,
        eligible: null,
        skipped: null,
        error: "evaluation failed",
      });
    }
  }

  return NextResponse.json({ definitions });
}
