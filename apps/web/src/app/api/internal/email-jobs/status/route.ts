// Read-only status poll for Control Tower. Returns the SAME aggregate shape as the dispatch
// endpoint (aggregates + masked sample only — never recipient PII). This is a read path, so a
// plain Bearer (CT_DISPATCH_SECRET) is sufficient; the load-bearing HMAC is reserved for the
// state-mutating dispatch write. Fail-closed: missing secret -> 500, mismatch -> 401.
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { bearerMatches } from "@/lib/email-campaigns/internal-auth";
import { aggregateJobResponse } from "@/lib/email-campaigns/job-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const secret = process.env.CT_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { jobId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  // Validate shape before querying so a malformed id returns 404, not a DB error.
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: job } = await serviceClient
    .from("email_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(aggregateJobResponse(job));
}
