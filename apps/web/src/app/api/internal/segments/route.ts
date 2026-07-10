// Internal segment-count endpoint for the Control Tower Email hub bridge. Given an
// executionKey, it evaluates an audience segment against production user state and returns
// ONLY a count plus a small ANONYMIZED sample (masked handles). It never returns emails or
// any raw PII. Bearer-authenticated with CT_BRIDGE_SECRET, fail-closed. Testers are excluded
// everywhere (except the pre-signup founding-applicant table, which has no is_tester column).
//
// The segment logic itself lives in lib/email-campaigns/resolve-segment.ts, shared with the
// real campaign send (/api/internal/email-jobs), so a preview here can never resolve a
// different audience than a send does. This route only adds the count + masking on top.
//
// max_rows caveat: the shared resolver's selects are bounded by PostgREST's max_rows (1000),
// so counts derived from it become estimates above 1000 rows. Acceptable at current volume.
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { bearerMatches } from "@/lib/email-campaigns/internal-auth";
import {
  resolveSegmentArtists,
  KNOWN,
} from "@/lib/email-campaigns/resolve-segment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_N = 8;

// Anonymize a handle for the sample: reveal at most the first character of the WHOLE handle
// and mask the rest — no underscore structure, no per-segment reveal — and fully mask anything
// shorter than 4 chars. "inkby_maya" -> "i***", "maya" -> "m***", "jo" -> "***". The sample
// exists only so an operator can eyeball that a segment resolves to real rows; it must never
// carry reconstructable identity. Anything more sensitive (see beta_artists) is count-only.
function maskHandle(raw: string | null | undefined): string {
  if (!raw || raw.length < 4) return "***";
  return `${raw[0]}***`;
}

export async function POST(request: Request) {
  const secret = process.env.CT_BRIDGE_SECRET;
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { executionKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const executionKey =
    typeof body.executionKey === "string" ? body.executionKey : "";
  if (!KNOWN.has(executionKey)) {
    return NextResponse.json({ error: "unknown segment" }, { status: 400 });
  }
  try {
    // beta_artists is count-only: pre-signup applicants live in their own RLS-locked table
    // (migration 0056) with no profiles row, so the resolver returns [] for sending. Here the
    // bridge surfaces their COUNT for planning, but no handle sample crosses the boundary.
    if (executionKey === "beta_artists") {
      const { count, error } = await serviceClient
        .from("founding_artist_applications")
        .select("id", { count: "exact", head: true })
        .eq("application_status", "onboarded")
        .eq("consent_beta_communication", true);
      if (error) throw error;
      return NextResponse.json({ count: count ?? 0, sample: [] });
    }

    const rows = await resolveSegmentArtists(executionKey);
    return NextResponse.json({
      count: rows.length,
      sample: rows
        .slice(0, SAMPLE_N)
        .map((r) => maskHandle(r.instagram_handle ?? r.slug)),
    });
  } catch {
    // never leak query internals or data
    return NextResponse.json(
      { error: "segment evaluation failed" },
      { status: 500 },
    );
  }
}
