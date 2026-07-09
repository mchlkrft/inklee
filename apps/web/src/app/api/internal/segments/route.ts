// Internal segment-count endpoint for the Control Tower Email hub bridge. Given an
// executionKey, it evaluates an audience segment against production user state and returns
// ONLY a count plus a small ANONYMIZED sample (masked handles). It never returns emails or
// any raw PII. Bearer-authenticated with CT_BRIDGE_SECRET, fail-closed. Testers are excluded
// everywhere (except the pre-signup founding-applicant table, which has no is_tester column).
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { parseBooksSettings, deriveBooksOpen } from "@/lib/books-settings";
import { todayInTimeZone } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_N = 8;
const DAY_MS = 86_400_000;

interface SegmentResult {
  count: number;
  sample: string[];
}

// "inkby_maya" -> "i***_m***": keep the first char of each underscore-part, mask the rest.
function maskHandle(raw: string | null | undefined): string {
  if (!raw) return "***";
  return raw
    .split("_")
    .map((part) => (part.length === 0 ? "" : `${part[0]}***`))
    .join("_");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Builder = any;

/** Run a count+sample query on non-tester profiles, applying the segment's extra filters. */
async function runProfiles(
  extra?: (q: Builder) => Builder,
): Promise<SegmentResult> {
  let q = serviceClient
    .from("profiles")
    .select("instagram_handle, slug", { count: "exact" })
    .eq("is_tester", false);
  if (extra) q = extra(q);
  const { count, data, error } = await q.limit(SAMPLE_N);
  if (error) throw error;
  return {
    count: count ?? 0,
    sample: (data ?? []).map((r: Builder) =>
      maskHandle(r.instagram_handle ?? r.slug),
    ),
  };
}

/** Non-tester profiles whose id is in (inclusive) or not in the given set. Empty guards. */
async function runProfilesByIds(
  ids: string[],
  inclusive: boolean,
  extra?: (q: Builder) => Builder,
): Promise<SegmentResult> {
  if (inclusive && ids.length === 0) return { count: 0, sample: [] };
  let q = serviceClient
    .from("profiles")
    .select("instagram_handle, slug", { count: "exact" })
    .eq("is_tester", false);
  if (extra) q = extra(q);
  if (inclusive) q = q.in("id", ids);
  else if (ids.length > 0) q = q.not("id", "in", `(${ids.join(",")})`);
  const { count, data, error } = await q.limit(SAMPLE_N);
  if (error) throw error;
  return {
    count: count ?? 0,
    sample: (data ?? []).map((r: Builder) =>
      maskHandle(r.instagram_handle ?? r.slug),
    ),
  };
}

/** Distinct artist_ids from a child table (booking_requests, trips), with optional filters. */
async function distinctArtistIds(
  table: string,
  extra?: (q: Builder) => Builder,
): Promise<string[]> {
  let q = serviceClient.from(table).select("artist_id");
  if (extra) q = extra(q);
  const { data, error } = await q;
  if (error) throw error;
  return [
    ...new Set((data ?? []).map((r: Builder) => r.artist_id).filter(Boolean)),
  ] as string[];
}

const iso = (msAgo: number): string =>
  new Date(Date.now() - msAgo).toISOString();

async function evaluate(executionKey: string): Promise<SegmentResult> {
  switch (executionKey) {
    case "all_artists":
      return runProfiles((q) => q.eq("account_status", "active"));

    case "beta_artists": {
      // pre-signup applicants: their own table, no is_tester column (documented)
      const { count, data, error } = await serviceClient
        .from("founding_artist_applications")
        .select("instagram_handle", { count: "exact" })
        .eq("application_status", "onboarded")
        .eq("consent_beta_communication", true)
        .limit(SAMPLE_N);
      if (error) throw error;
      return {
        count: count ?? 0,
        sample: (data ?? []).map((r: Builder) =>
          maskHandle(r.instagram_handle),
        ),
      };
    }

    case "setup_incomplete":
      // key-absent rows are SQL NULL, so include both null and not-'true'
      return runProfiles((q) =>
        q
          .eq("account_status", "active")
          .or(
            "settings->>onboarding_completed.is.null,settings->>onboarding_completed.neq.true",
          ),
      );

    case "setup_complete":
      return runProfiles((q) =>
        q.eq("settings->>onboarding_completed", "true"),
      );

    case "booking_page_live":
      return runProfiles((q) =>
        q
          .not("slug", "is", null)
          .eq("account_status", "active")
          .is("deleted_at", null),
      );

    case "no_requests_yet": {
      const booked = await distinctArtistIds("booking_requests");
      return runProfilesByIds(booked, false, (q) =>
        q
          .not("slug", "is", null)
          .eq("account_status", "active")
          .is("deleted_at", null),
      );
    }

    case "has_received_requests": {
      const booked = await distinctArtistIds("booking_requests");
      return runProfilesByIds(booked, true);
    }

    case "has_approved_bookings": {
      const approved = await distinctArtistIds("booking_requests", (q) =>
        q.eq("status", "approved"),
      );
      return runProfilesByIds(approved, true);
    }

    case "guest_spot_users": {
      const withTrips = await distinctArtistIds("trips");
      return runProfilesByIds(withTrips, true);
    }

    case "books_open_users": {
      const { data, error } = await serviceClient
        .from("profiles")
        .select("instagram_handle, slug, settings, timezone")
        .eq("is_tester", false)
        .eq("account_status", "active");
      if (error) throw error;
      const open = (data ?? []).filter((r: Builder) => {
        const books = parseBooksSettings((r.settings ?? {}).books_settings);
        return deriveBooksOpen(books, todayInTimeZone(r.timezone)).booksOpen;
      });
      return {
        count: open.length,
        sample: open
          .slice(0, SAMPLE_N)
          .map((r: Builder) => maskHandle(r.instagram_handle ?? r.slug)),
      };
    }

    case "deposit_enabled":
      return runProfiles((q) =>
        q
          .eq("stripe_account_status", "active")
          .eq("stripe_charges_enabled", true),
      );

    case "inactive_artists": {
      // active artists with no booking activity in the last 30 days (includes never-booked)
      const recent = await distinctArtistIds("booking_requests", (q) =>
        q.gte("created_at", iso(30 * DAY_MS)),
      );
      return runProfilesByIds(recent, false, (q) =>
        q.eq("account_status", "active"),
      );
    }

    case "new_artists":
      return runProfiles((q) => q.gte("created_at", iso(14 * DAY_MS)));

    case "high_activity_artists": {
      const { data, error } = await serviceClient
        .from("booking_requests")
        .select("artist_id")
        .gte("created_at", iso(30 * DAY_MS));
      if (error) throw error;
      const tally = new Map<string, number>();
      for (const r of (data ?? []) as Builder[])
        if (r.artist_id)
          tally.set(r.artist_id, (tally.get(r.artist_id) ?? 0) + 1);
      const highIds = [...tally].filter(([, n]) => n >= 10).map(([id]) => id);
      return runProfilesByIds(highIds, true);
    }

    case "at_risk_inactive": {
      const recent = await distinctArtistIds("booking_requests", (q) =>
        q.gte("created_at", iso(21 * DAY_MS)),
      );
      return runProfilesByIds(recent, false, (q) =>
        q
          .eq("settings->>onboarding_completed", "true")
          .eq("account_status", "active"),
      );
    }

    default:
      throw new Error("unknown segment");
  }
}

const KNOWN = new Set([
  "all_artists",
  "beta_artists",
  "setup_incomplete",
  "setup_complete",
  "booking_page_live",
  "no_requests_yet",
  "has_received_requests",
  "has_approved_bookings",
  "guest_spot_users",
  "books_open_users",
  "deposit_enabled",
  "inactive_artists",
  "new_artists",
  "high_activity_artists",
  "at_risk_inactive",
]);

export async function POST(request: Request) {
  const secret = process.env.CT_BRIDGE_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
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
    const { count, sample } = await evaluate(executionKey);
    return NextResponse.json({ count, sample });
  } catch {
    // never leak query internals or data
    return NextResponse.json(
      { error: "segment evaluation failed" },
      { status: 500 },
    );
  }
}
