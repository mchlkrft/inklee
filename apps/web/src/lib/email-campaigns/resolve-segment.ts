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

/**
 * Age-window filter on profiles.created_at: at least minDays old AND younger than maxDays.
 * profiles.created_at is the slug-claim time (the row is created by the claim upsert), so
 * "age" here means days since onboarding started. The lifecycle trigger segments are
 * WINDOWED, not floor-only, so an artist qualifies for exactly the one stage matching their
 * current age and a backlog can never receive a whole staged sequence at once; the engine's
 * once-ever marker then prevents re-fires within the stage.
 */
const ageWindow =
  (minDays: number, maxDays: number) =>
  (q: Builder): Builder =>
    q
      .lte("created_at", iso(minDays * DAY_MS))
      .gt("created_at", iso(maxDays * DAY_MS));

const incompleteOr =
  "settings->>onboarding_completed.is.null,settings->>onboarding_completed.neq.true";

/**
 * Distinct actor ids from audit_log for one action since a cutoff (paged to completion).
 * Powers books_open_recent: coverage is a deliberate SAFE SUBSET, because books default
 * OPEN with no audit row and the onboarding paths skip the audit write; only artists with
 * a books_opened row qualify, and nobody long-open is ever re-notified. The write sites
 * are transition-gated (the action means the flag actually flipped), and the resolver
 * additionally intersects with the CURRENT open state below, so an artist who opened and
 * closed within the window can never be told their books are open.
 */
async function distinctActorIds(
  action: string,
  sinceMs: number,
): Promise<string[]> {
  const rows = await fetchAllRows(
    () =>
      serviceClient
        .from("audit_log")
        .select("actor")
        .eq("action", action)
        .gte("timestamp", iso(sinceMs)),
    CHILD_SCAN_CAP,
  );
  return [
    ...new Set(rows.map((r: Builder) => r.actor).filter(Boolean)),
  ] as string[];
}

/**
 * The inactivity windows: onboarding complete, active, HAD booking activity inside
 * horizonDays but NONE for quietDays. Requiring real prior activity makes the track
 * disjoint from the no_requests track (never-booked artists belong solely there, so
 * nobody rides both sequences at once), and the horizon means the long-dormant base is
 * never suddenly emailed when a definition activates. Activity is the booking-activity
 * proxy the admin surface and inactive_artists already use (requests arriving); a true
 * artist last-seen needs product work (flagged in the admin UI itself).
 */
async function inactiveWindow(
  quietDays: number,
  horizonDays: number,
): Promise<SegmentArtist[]> {
  const [recent, horizon] = await Promise.all([
    distinctArtistIds("booking_requests", (q) =>
      q.gte("created_at", iso(quietDays * DAY_MS)),
    ),
    distinctArtistIds("booking_requests", (q) =>
      q.gte("created_at", iso(horizonDays * DAY_MS)),
    ),
  ]);
  const recentSet = new Set(recent);
  const horizonSet = new Set(horizon);
  const rows = await fetchAllRows(() =>
    serviceClient
      .from("profiles")
      .select("id, instagram_handle, slug")
      .eq("is_tester", false)
      .eq("account_status", "active")
      .eq("settings->>onboarding_completed", "true")
      .lte("created_at", iso(quietDays * DAY_MS)),
  );
  return (rows as SegmentArtist[]).filter(
    (r) => horizonSet.has(r.id) && !recentSet.has(r.id),
  );
}

/**
 * The no-requests windows: page live (slug + active + not deleted), onboarding complete,
 * ZERO booking requests ever, aged into the window. Page-live time is approximated by the
 * slug-claim time (profiles.created_at), which is exact for row creation and the closest
 * timestamp that exists (there is no page_live_at column).
 */
async function noRequestsWindow(
  minDays: number,
  maxDays: number,
): Promise<SegmentArtist[]> {
  const booked = await distinctArtistIds("booking_requests");
  return runProfilesByIds(booked, false, (q) =>
    ageWindow(
      minDays,
      maxDays,
    )(
      q
        .not("slug", "is", null)
        .eq("account_status", "active")
        .is("deleted_at", null)
        .eq("settings->>onboarding_completed", "true"),
    ),
  );
}

/** The valid execution keys. Shared allowlist for both the bridge and the send endpoint. */
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
  // lifecycle trigger segments (day-N windows; see the helper docs above)
  "new_signups",
  "setup_incomplete_day_1",
  "setup_incomplete_day_3",
  "setup_incomplete_day_7",
  "no_requests_day_7",
  "no_requests_day_14",
  "no_requests_day_30",
  "inactive_day_14",
  "inactive_day_30",
  "inactive_day_60",
  "first_booking_recent",
  "books_open_recent",
  "guest_spot_recent",
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

    // ------------------------------------------------ lifecycle trigger segments

    case "new_signups":
      // claimed a slug within the last 2 days; the welcome's once-ever marker plus this
      // tight window means the existing base is never welcomed late
      return runProfiles((q) =>
        q.eq("account_status", "active").gte("created_at", iso(2 * DAY_MS)),
      );

    case "setup_incomplete_day_1":
      return runProfiles((q) =>
        ageWindow(1, 3)(q.eq("account_status", "active").or(incompleteOr)),
      );

    case "setup_incomplete_day_3":
      return runProfiles((q) =>
        ageWindow(3, 7)(q.eq("account_status", "active").or(incompleteOr)),
      );

    case "setup_incomplete_day_7":
      // 30-day ceiling: dormant months-old signups are never suddenly nudged
      return runProfiles((q) =>
        ageWindow(7, 30)(q.eq("account_status", "active").or(incompleteOr)),
      );

    case "no_requests_day_7":
      return noRequestsWindow(7, 14);
    case "no_requests_day_14":
      return noRequestsWindow(14, 30);
    case "no_requests_day_30":
      return noRequestsWindow(30, 90);

    case "inactive_day_14":
      return inactiveWindow(14, 30);
    case "inactive_day_30":
      return inactiveWindow(30, 60);
    case "inactive_day_60":
      return inactiveWindow(60, 120);

    case "first_booking_recent": {
      // Artists whose EARLIEST approved public-form booking was decided within the last
      // 14 days: approved recently AND never approved before the window. origin filter:
      // the milestone copy describes the request flow, so artist-created manual
      // appointments neither trigger it nor suppress it. The third scan excludes artists
      // with an approved row whose decided_at is NULL (a tracked legacy anomaly, see the
      // admin "Approved, no decided_at" tile): an approval of unknown age must never let
      // a later one read as the first. Known miss-only gap: a deposit marked received
      // manually keeps its deposit-request-time decided_at, so a first booking confirmed
      // more than 14 days after the deposit request misses the milestone (never a wrong
      // send).
      const [recentApproved, priorApproved, undatedApproved] =
        await Promise.all([
          distinctArtistIds("booking_requests", (q) =>
            q
              .eq("status", "approved")
              .eq("origin", "public_form")
              .gte("decided_at", iso(14 * DAY_MS)),
          ),
          distinctArtistIds("booking_requests", (q) =>
            q
              .eq("status", "approved")
              .eq("origin", "public_form")
              .lt("decided_at", iso(14 * DAY_MS)),
          ),
          distinctArtistIds("booking_requests", (q) =>
            q
              .eq("status", "approved")
              .eq("origin", "public_form")
              .is("decided_at", null),
          ),
        ]);
      const prior = new Set([...priorApproved, ...undatedApproved]);
      return runProfilesByIds(
        recentApproved.filter((id) => !prior.has(id)),
        true,
        (q) => q.eq("account_status", "active"),
      );
    }

    case "books_open_recent": {
      // A books_opened audit row within 7 days (transition-gated at the write sites)
      // INTERSECTED with the current derived open state, the same derivation
      // books_open_users runs: an artist who opened then closed inside the window can
      // never be told their books are open. Historical pre-gate audit rows (written on
      // every save while open) age out of the 7-day window after deploy; the current-open
      // intersection bounds them until then.
      const actors = await distinctActorIds("books_opened", 7 * DAY_MS);
      if (actors.length === 0) return [];
      const actorSet = new Set(actors);
      const rows = await fetchAllRows(() =>
        serviceClient
          .from("profiles")
          .select("id, instagram_handle, slug, settings, timezone")
          .eq("is_tester", false)
          .eq("account_status", "active"),
      );
      return rows
        .filter((r: Builder) => {
          if (!actorSet.has(r.id)) return false;
          const books = parseBooksSettings((r.settings ?? {}).books_settings);
          return deriveBooksOpen(books, todayInTimeZone(r.timezone)).booksOpen;
        })
        .map((r: Builder) => ({
          id: r.id,
          instagram_handle: r.instagram_handle,
          slug: r.slug,
        }));
    }

    case "guest_spot_recent": {
      const withNewTrips = await distinctArtistIds("trips", (q) =>
        q.gte("created_at", iso(7 * DAY_MS)),
      );
      return runProfilesByIds(withNewTrips, true, (q) =>
        q.eq("account_status", "active"),
      );
    }

    default:
      throw new Error("unknown segment");
  }
}
