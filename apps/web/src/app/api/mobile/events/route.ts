import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { serviceClient } from "@/lib/supabase/service";
import { checkGrowthEventsRateLimit } from "@/lib/ratelimit";
import { recordGrowthEvent } from "@/lib/growth/record-event";
import {
  CLIENT_INGESTIBLE_EVENTS,
  validateGrowthEvent,
} from "@/lib/growth/event-catalogue";
import type { GrowthEventInput } from "@/lib/growth/event-catalogue";

export const runtime = "nodejs";

const MAX_BATCH = 20;

// POST /api/mobile/events — batch ingestion for catalogued growth events from
// the native app: { events: [{ event, props, occurredAt? }] }. Two hard gates:
// the catalogue (unknown names / invalid props are dropped, never stored) and
// the CLIENT_INGESTIBLE_EVENTS allowlist (milestone events are server-observed
// only; a client-asserted milestone would poison the once-only dedupe key).
// Rate-limited per artist so one account cannot flood analytics_events. The app
// posts booking_link_copied here (reportBookingLinkCopied); the generic
// client-side track() stays a deliberate no-op (the rest of the mobile
// vocabulary is already captured server-side and would double-count).
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const { allowed } = await checkGrowthEventsRateLimit(auth.userId);
  if (!allowed) return mobileError(429, "Too many events. Try again later.");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const events = (raw as { events?: unknown })?.events;
  if (!Array.isArray(events) || events.length === 0) {
    return mobileError(400, "Body must contain a non-empty events array.");
  }
  if (events.length > MAX_BATCH) {
    return mobileError(400, `At most ${MAX_BATCH} events per request.`);
  }

  // One tester lookup per request (not per event): the recorder would
  // otherwise re-check profiles.is_tester for every batch entry.
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_tester")
    .eq("id", auth.userId)
    .maybeSingle();
  const isTester = profile?.is_tester === true;

  let accepted = 0;
  const pending: Promise<void>[] = [];
  for (const entry of events) {
    const candidate = entry as {
      event?: unknown;
      props?: unknown;
      occurredAt?: unknown;
    };
    const validated = validateGrowthEvent(
      typeof candidate.event === "string" ? candidate.event : "",
      candidate.props,
    );
    if (!validated) continue;
    if (
      !(CLIENT_INGESTIBLE_EVENTS as readonly string[]).includes(validated.event)
    ) {
      continue;
    }

    // Client timestamps are accepted only within a sane window (24h back,
    // 5min forward) so a wrong device clock cannot rewrite history.
    let occurredAt: Date | undefined;
    if (typeof candidate.occurredAt === "string") {
      const parsed = new Date(candidate.occurredAt);
      const skew = Date.now() - parsed.getTime();
      if (
        !Number.isNaN(parsed.getTime()) &&
        skew < 86_400_000 &&
        skew > -300_000
      ) {
        occurredAt = parsed;
      }
    }

    pending.push(
      recordGrowthEvent(
        { event: validated.event, props: validated.props } as GrowthEventInput,
        {
          artistId: auth.userId,
          source: "mobile",
          email: auth.email,
          isTester,
          occurredAt,
        },
      ),
    );
    accepted++;
  }

  // Awaited before responding: work left running after the response can be
  // lost to serverless teardown (the recorder never throws, so this is safe).
  await Promise.all(pending);

  return mobileOk({ accepted, dropped: events.length - accepted });
}
