// Shared audience segment resolver for the Email hub. This is the single seam that
// BOTH the Control Tower preview bridge (/api/internal/segments — count + masked
// sample) and the real campaign send (/api/internal/email-jobs — resolve → filter →
// batch send) go through, so a preview can never resolve a different audience than the
// send does. Extracted from the segments-bridge's inline evaluate() switch.
//
// resolveSegmentArtists(executionKey) returns the matched NON-TESTER artist rows. The
// is_tester=false filter is applied on every path (testers never enter a real campaign),
// exactly as the bridge did. It returns raw {id, instagram_handle, slug} rows for internal
// use; anonymization/masking is the caller's concern (the bridge masks; the send never
// returns handles to Control Tower at all).
//
// PostgREST caps every response at max_rows (1000 in config.toml), so a single .select()
// silently truncates at 1000 rows. That would (a) make the endpoint's >5000 audience breaker
// dead (audience could never exceed 1000), (b) under-send large audiences, and (c) truncate the
// "recent activity" child scans that the exclusion segments (no_requests_yet / inactive_artists /
// at_risk_inactive) subtract, wrongly re-engaging recently-active artists. So every scan here
// pages with .range() in 1000-row windows until a short page. Profile/audience scans are bounded
// at RESOLVE_CAP (5001) so the endpoint's >5000 circuit breaker can still fire; child activity
// scans use a much larger guard so the exclusion sets stay complete.
import { serviceClient } from "@/lib/supabase/service";
import { parseBooksSettings, deriveBooksOpen } from "@/lib/books-settings";
import { todayInTimeZone } from "@/lib/date-utils";

const DAY_MS = 86_400_000;
const PAGE = 1000; // PostgREST max_rows window
// Audience scans stop one row past MAX_CAMPAIGN_RECIPIENTS (5000) so an oversized audience is
// observable and the endpoint's circuit breaker fires instead of silently under-sending.
const RESOLVE_CAP = 5001;
// Activity scans (which are SUBTRACTED to build exclusion sets) must stay complete, so they page
// with a generous guard; at beta volume they drain in a single page anyway.
const CHILD_SCAN_CAP = 100_000;

export type SegmentArtist = {
  id: string;
  instagram_handle: string | null;
  slug: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Builder = any;

/**
 * Page a select in 1000-row windows until a short page (or the cap). `makeQuery` must return a
 * FRESH builder each call so .range() applies to a new request. Bounded by `cap` rows total.
 *
 * Every page is ordered by the table's `id` (appended AFTER any order the caller set, so it
 * acts as a tiebreaker): offset pagination over a non-unique or absent order is unstable in
 * Postgres, and a row straddling a page boundary could be returned twice or dropped. Exported
 * for other internal endpoints (the metrics rollup) so this logic exists exactly once.
 */
export async function fetchAllRows(
  makeQuery: () => Builder,
  cap: number = RESOLVE_CAP,
): Promise<Builder[]> {
  const rows: Builder[] = [];
  for (let offset = 0; offset < cap; offset += PAGE) {
    const end = Math.min(offset + PAGE - 1, cap - 1);
    const { data, error } = await makeQuery()
      .order("id", { ascending: true })
      .range(offset, end);
    if (error) throw error;
    const batch = (data ?? []) as Builder[];
    rows.push(...batch);
    if (batch.length < PAGE) break; // short page => drained
  }
  return rows;
}

/** Non-tester profiles matching the segment's extra filters (paged, bounded at RESOLVE_CAP). */
async function runProfiles(
  extra?: (q: Builder) => Builder,
): Promise<SegmentArtist[]> {
  const rows = await fetchAllRows(() => {
    let q = serviceClient
      .from("profiles")
      .select("id, instagram_handle, slug")
      .eq("is_tester", false);
    if (extra) q = extra(q);
    return q;
  });
  return rows as SegmentArtist[];
}

/**
 * Non-tester profiles whose id is in (inclusive) or not in the given set. Membership is applied
 * in JS after paging profiles (bounded at RESOLVE_CAP) so we never build a giant .in()/.not-in()
 * URL from a large id set. Empty inclusive guard short-circuits.
 */
async function runProfilesByIds(
  ids: string[],
  inclusive: boolean,
  extra?: (q: Builder) => Builder,
): Promise<SegmentArtist[]> {
  if (inclusive && ids.length === 0) return [];
  const idSet = new Set(ids);
  const rows = await fetchAllRows(() => {
    let q = serviceClient
      .from("profiles")
      .select("id, instagram_handle, slug")
      .eq("is_tester", false);
    if (extra) q = extra(q);
    return q;
  });
  return (rows as SegmentArtist[]).filter((r) =>
    inclusive ? idSet.has(r.id) : !idSet.has(r.id),
  );
}

/**
 * Distinct artist_ids from a child table (booking_requests, trips), with optional filters. Paged
 * to completion under CHILD_SCAN_CAP: these sets are subtracted to form exclusion audiences, so a
 * truncated scan would wrongly re-engage recently-active artists — they must stay complete.
 */
async function distinctArtistIds(
  table: string,
  extra?: (q: Builder) => Builder,
): Promise<string[]> {
  const rows = await fetchAllRows(() => {
    let q = serviceClient.from(table).select("artist_id");
    if (extra) q = extra(q);
    return q;
  }, CHILD_SCAN_CAP);
  return [
    ...new Set(rows.map((r: Builder) => r.artist_id).filter(Boolean)),
  ] as string[];
}

const iso = (msAgo: number): string =>
  new Date(Date.now() - msAgo).toISOString();

/** The 15 valid execution keys. Shared allowlist for both the bridge and the send endpoint. */
export const KNOWN = new Set([
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

/**
 * Resolve an execution key to the matched non-tester artist rows. Returns [] for
 * beta_artists: those are pre-signup founding applicants in founding_artist_applications
 * with no profiles row and no artist account, so they are not a sendable campaign audience.
 * The segments bridge still surfaces their COUNT for planning, but sending to them is out
 * of scope for slice 9 (they are not artist accounts yet). Throws on an unknown key — the
 * caller validates against KNOWN first.
 */
export async function resolveSegmentArtists(
  executionKey: string,
): Promise<SegmentArtist[]> {
  switch (executionKey) {
    case "all_artists":
      return runProfiles((q) => q.eq("account_status", "active"));

    case "beta_artists":
      // Pre-signup applicants are not artist accounts — cannot be a send audience.
      return [];

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
      const rows = await fetchAllRows(() =>
        serviceClient
          .from("profiles")
          .select("id, instagram_handle, slug, settings, timezone")
          .eq("is_tester", false)
          .eq("account_status", "active"),
      );
      return rows
        .filter((r: Builder) => {
          const books = parseBooksSettings((r.settings ?? {}).books_settings);
          return deriveBooksOpen(books, todayInTimeZone(r.timezone)).booksOpen;
        })
        .map((r: Builder) => ({
          id: r.id,
          instagram_handle: r.instagram_handle,
          slug: r.slug,
        }));
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
      const rows = await fetchAllRows(
        () =>
          serviceClient
            .from("booking_requests")
            .select("artist_id")
            .gte("created_at", iso(30 * DAY_MS)),
        CHILD_SCAN_CAP,
      );
      const tally = new Map<string, number>();
      for (const r of rows as Builder[])
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
