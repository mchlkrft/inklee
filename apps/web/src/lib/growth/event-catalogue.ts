/**
 * The analytics event catalogue: the ONLY event names and properties that may
 * enter analytics_events. Adding an event = add it here + document it in
 * docs/analytics-event-catalogue.md (same PR). The single writer
 * (record-event.ts) rejects anything else, so event naming can never sprawl.
 *
 * Prop rules (same contract as lib/track.ts): coarse, enumerable labels only.
 * Never emails, names, handles, booking or client data, free text, IP, or
 * user agent.
 */

import { z } from "zod";

export const ONBOARDING_STEPS = [
  "claim_slug",
  "booking",
  "availability",
  "form",
  "profile",
  "done",
] as const;

export const GROWTH_EVENT_SCHEMAS = {
  /** An onboarding step was completed (server action / mobile route level,
   *  first completion only via dedupe key). */
  onboarding_step_completed: z
    .object({ step: z.enum(ONBOARDING_STEPS) })
    .strict(),
  /** Onboarding finished (the settings flag flipped true for the first time).
   *  Supplies the timestamp the canonical boolean lacks. */
  onboarding_completed: z.object({}).strict(),
  /** Public booking page went live (first successful slug claim). */
  page_published: z.object({}).strict(),
  /** The artist copied or shared their booking link. */
  booking_link_copied: z
    .object({
      surface: z.enum([
        "onboarding_done",
        "dashboard",
        "link_hub",
        "mobile_app",
      ]),
    })
    .strict(),
} as const;

export type GrowthEventName = keyof typeof GROWTH_EVENT_SCHEMAS;

export const GROWTH_EVENT_NAMES = Object.keys(
  GROWTH_EVENT_SCHEMAS,
) as GrowthEventName[];

/**
 * Events a CLIENT may submit through ingestion endpoints. Milestone events
 * (onboarding_step_completed, onboarding_completed, page_published) are
 * server-observed only: accepting them from clients would let an artist forge
 * a milestone whose dedupe key then permanently blocks the genuine one.
 */
export const CLIENT_INGESTIBLE_EVENTS = [
  "booking_link_copied",
] as const satisfies readonly GrowthEventName[];

export type GrowthEventInput = {
  [K in GrowthEventName]: {
    event: K;
    props: z.infer<(typeof GROWTH_EVENT_SCHEMAS)[K]>;
  };
}[GrowthEventName];

/** Milestone events fire once per subject; the dedupe key enforces that in
 *  the database (partial unique index, migration 0067). */
export function dedupeKeyFor(
  event: GrowthEventName,
  artistId: string,
  props: Record<string, unknown>,
): string | null {
  switch (event) {
    case "onboarding_step_completed":
      return `${artistId}:${String(props.step)}`;
    case "onboarding_completed":
    case "page_published":
      return artistId;
    case "booking_link_copied":
      return null; // repeatable
  }
}

/** Validate an (event, props) pair against the catalogue. Returns the parsed
 *  props or null when the event is unknown / props are invalid. */
export function validateGrowthEvent(
  event: string,
  props: unknown,
): { event: GrowthEventName; props: Record<string, string> } | null {
  if (!GROWTH_EVENT_NAMES.includes(event as GrowthEventName)) return null;
  const schema = GROWTH_EVENT_SCHEMAS[event as GrowthEventName];
  const parsed = schema.safeParse(props ?? {});
  if (!parsed.success) return null;
  return {
    event: event as GrowthEventName,
    props: parsed.data as Record<string, string>,
  };
}
