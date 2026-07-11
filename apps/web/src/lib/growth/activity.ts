/**
 * Day-grain artist presence: touchArtistActivity upserts one row per
 * (artist, day, surface) into artist_activity_days. Called fire-and-forget
 * from the authed (artist) layout (web) and the mobile bearer auth (mobile).
 *
 * Debounce: an in-process map remembers (artist, surface) -> day already
 * touched, so steady traffic costs zero extra queries per request. After a
 * cold start the first request per artist/day re-upserts, which the primary
 * key turns into a no-op. Day boundaries use the reporting timezone
 * (growth settings) so presence days line up with every other cockpit metric.
 */

import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { dayKeyInTimeZone } from "./date-range";
import { GROWTH_SETTINGS_DEFAULTS, loadGrowthSettings } from "./settings";

const touched = new Map<string, string>();
const MAX_DEBOUNCE_ENTRIES = 5_000;

// The reporting timezone changes ~never; a cross-request TTL memo keeps the
// per-request settings read off the hot path (this helper runs on every authed
// page render and mobile API call).
let cachedTimezone: { value: string; fetchedAt: number } | null = null;
const TIMEZONE_TTL_MS = 10 * 60_000;

async function reportingTimezone(): Promise<string> {
  if (
    cachedTimezone &&
    Date.now() - cachedTimezone.fetchedAt < TIMEZONE_TTL_MS
  ) {
    return cachedTimezone.value;
  }
  try {
    const settings = await loadGrowthSettings();
    cachedTimezone = {
      value: settings.reporting_timezone,
      fetchedAt: Date.now(),
    };
  } catch {
    // A failed settings read must not block presence tracking.
    cachedTimezone = {
      value: GROWTH_SETTINGS_DEFAULTS.reporting_timezone,
      fetchedAt: Date.now(),
    };
  }
  return cachedTimezone.value;
}

/** Never throws, never blocks: call as `void touchArtistActivity(...)`. */
export async function touchArtistActivity(
  artistId: string,
  surface: "web" | "mobile",
): Promise<void> {
  try {
    const key = `${artistId}:${surface}`;
    const day = dayKeyInTimeZone(new Date(), await reportingTimezone());
    if (touched.get(key) === day) return;

    const { error } = await serviceClient.from("artist_activity_days").insert({
      artist_id: artistId,
      day,
      surface,
    });

    if (!error || error.code === "23505") {
      // Mark the debounce only once the row is known to exist, so a transient
      // failure (or a pre-claim mobile user, 23503) retries on the next request.
      if (touched.size > MAX_DEBOUNCE_ENTRIES) touched.clear();
      touched.set(key, day);
    } else if (error.code !== "23503") {
      // 23503 = no profile row yet (pre-claim mobile user or deleted account).
      console.error("[growth] activity touch failed", error.message);
    }
  } catch (err) {
    console.error("[growth] touchArtistActivity crashed", err);
  }
}
