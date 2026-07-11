/**
 * The single writer for analytics_events. Server-only, fire-and-forget:
 * analytics must never break the product, so failures are logged and
 * swallowed. Tester/admin exclusion happens HERE, at write time, so the read
 * side never has to re-clean supplemental events.
 */

import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/admin-guard";
import {
  dedupeKeyFor,
  validateGrowthEvent,
  type GrowthEventInput,
} from "./event-catalogue";

export type RecordGrowthEventOptions = {
  artistId: string;
  source: "web" | "mobile";
  /** Caller-known exclusion context; missing pieces are looked up. */
  email?: string | null;
  isTester?: boolean;
  occurredAt?: Date;
};

/**
 * Record a catalogued growth event. Never throws, so awaiting it can never
 * break the product. Convention: once-only dedupe-keyed milestones at
 * terminal moments (page published, onboarding completed) are AWAITED so they
 * cannot be lost to serverless teardown; repeatable high-frequency events are
 * fired as `void recordGrowthEvent(...)`.
 */
export async function recordGrowthEvent(
  input: GrowthEventInput,
  options: RecordGrowthEventOptions,
): Promise<void> {
  try {
    const validated = validateGrowthEvent(input.event, input.props);
    if (!validated) {
      console.error(`[growth] rejected uncatalogued event ${input.event}`);
      return;
    }

    if (options.email && isAdminEmail(options.email)) return;

    let tester = options.isTester;
    if (tester === undefined) {
      const { data } = await serviceClient
        .from("profiles")
        .select("is_tester")
        .eq("id", options.artistId)
        .maybeSingle();
      tester = data?.is_tester === true;
    }
    if (tester) return;

    const { error } = await serviceClient.from("analytics_events").insert({
      event_name: validated.event,
      artist_id: options.artistId,
      source: options.source,
      properties: validated.props,
      dedupe_key: dedupeKeyFor(
        validated.event,
        options.artistId,
        validated.props,
      ),
      occurred_at: (options.occurredAt ?? new Date()).toISOString(),
    });
    // 23505 = the dedupe key already exists: a repeat of a once-only
    // milestone, which is exactly what the index is for. Anything else is a
    // real failure worth a log line.
    if (error && error.code !== "23505") {
      console.error(`[growth] ${validated.event} insert failed`, error.message);
    }
  } catch (err) {
    console.error("[growth] recordGrowthEvent crashed", err);
  }
}
