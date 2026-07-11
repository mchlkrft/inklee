/**
 * Public web analytics event registry: the ONLY event names and properties
 * that may enter web_analytics_events. Pure module (client- and server-safe);
 * the ingestion route validates every payload against it, the client
 * collector types against it, and docs/public-analytics.md mirrors it.
 *
 * This is the ACQUISITION layer (anonymous public traffic). It is not a
 * second product-analytics system: authenticated artist behaviour stays in
 * analytics_events (see src/lib/growth/event-catalogue.ts).
 *
 * Prop rules: coarse enumerable labels only. Never form content, titles,
 * emails, handles, filenames or free text.
 */

export type PublicEventCategory = "acquisition" | "registration" | "booking";

export type PublicEventDefinition = {
  description: string;
  category: PublicEventCategory;
  isConversion: boolean;
  /** Allowed property keys -> allowed values ("*" = any short label). */
  properties: Record<string, readonly string[] | "*">;
  /**
   * Whether a browser may submit this event through the public /api/wa/collect
   * endpoint. Server-truth conversions (signup completed, booking completed,
   * beta invite) are recorded server-side only; accepting them from anonymous
   * clients would let anyone forge the founder's conversion KPIs.
   */
  clientEmittable: boolean;
  /** Where the event is emitted, or the reserved-for note. */
  emitter: string;
};

export const PUBLIC_EVENTS = {
  pageview: {
    description:
      "A visible public page navigation (initial load or client-side route change).",
    category: "acquisition",
    isConversion: false,
    properties: {},
    clientEmittable: true,
    emitter: "PublicAnalytics component (src/components/public-analytics.tsx)",
  },
  pricing_viewed: {
    description: "A pricing surface was viewed.",
    category: "acquisition",
    isConversion: false,
    properties: {},
    // Reserved, no emitter yet: keep it off the public ingest allowlist so a
    // client cannot POST it as visit noise. Flip to true with the real emitter.
    clientEmittable: false,
    emitter:
      "RESERVED: no /pricing page exists on master yet; wire when one ships.",
  },
  artist_signup_started: {
    description:
      "A signup form submission passed client validation and reached the server action.",
    category: "registration",
    isConversion: false,
    properties: { method: ["email", "google"] },
    // The email path emits server-side; the Google button emits client-side
    // (the redirect leaves the page), so both surfaces are allowed.
    clientEmittable: true,
    emitter:
      "signUpAction (server, email) + signup page Google button (client)",
  },
  artist_signup_completed: {
    description:
      "An artist account was created (auth signup succeeded; first-time OAuth accounts count once).",
    category: "registration",
    isConversion: true,
    properties: { method: ["email", "google"] },
    clientEmittable: false,
    emitter:
      "signUpAction success + app/auth/callback/route.ts for new OAuth accounts",
  },
  beta_invite_requested: {
    description:
      "The mobile-app launch waitlist form on /download was submitted successfully.",
    category: "registration",
    isConversion: true,
    properties: {},
    clientEmittable: false,
    emitter: "joinMobileWaitlistAction (app/download/actions.ts)",
  },
  app_store_clicked: {
    description: "The App Store badge was clicked.",
    category: "acquisition",
    isConversion: false,
    properties: {},
    // Reserved, no emitter yet: keep it off the public ingest allowlist (a real
    // badge-click emitter is client-side, so flip to true when it ships).
    clientEmittable: false,
    emitter:
      "RESERVED: /download badges are placeholder links until the app is in stores.",
  },
  play_store_clicked: {
    description: "The Google Play badge was clicked.",
    category: "acquisition",
    isConversion: false,
    properties: {},
    // Reserved, no emitter yet: keep it off the public ingest allowlist (a real
    // badge-click emitter is client-side, so flip to true when it ships).
    clientEmittable: false,
    emitter:
      "RESERVED: /download badges are placeholder links until the app is in stores.",
  },
  booking_page_viewed: {
    description: "A public artist booking page was viewed.",
    category: "booking",
    isConversion: false,
    properties: {},
    clientEmittable: true,
    emitter:
      "PublicAnalytics component (booking-page routes; also derivable from pageviews)",
  },
  booking_request_started: {
    description:
      "A public booking form submission was attempted (submit pressed).",
    category: "booking",
    isConversion: false,
    properties: {},
    clientEmittable: true,
    emitter: "Booking form client (app/[slug])",
  },
  booking_request_completed: {
    description: "A public booking request was successfully created.",
    category: "booking",
    isConversion: true,
    properties: {},
    clientEmittable: false,
    emitter: "Server-side in the booking submit action (app/[slug]/actions.ts)",
  },
} as const satisfies Record<string, PublicEventDefinition>;

export type PublicEventName = keyof typeof PUBLIC_EVENTS;

export const PUBLIC_EVENT_NAMES = Object.keys(
  PUBLIC_EVENTS,
) as PublicEventName[];

export function isConversionEvent(name: PublicEventName): boolean {
  return PUBLIC_EVENTS[name].isConversion;
}

export function isClientEmittable(name: PublicEventName): boolean {
  return PUBLIC_EVENTS[name].clientEmittable;
}

const MAX_PROP_VALUE_LENGTH = 80;

/**
 * Validate an (event, props) pair. Returns the cleaned props or null when the
 * event is unknown, a property is not allowlisted, or a value is not allowed.
 */
export function validatePublicEvent(
  name: string,
  props: unknown,
): { event: PublicEventName; props: Record<string, string> } | null {
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_EVENTS, name)) return null;
  const definition = PUBLIC_EVENTS[name as PublicEventName];
  const clean: Record<string, string> = {};
  if (props !== undefined && props !== null) {
    if (typeof props !== "object" || Array.isArray(props)) return null;
    for (const [key, value] of Object.entries(
      props as Record<string, unknown>,
    )) {
      // Own-property check: a prop key like "constructor" or "__proto__" must
      // reject cleanly, not resolve an inherited value and throw downstream.
      if (!Object.prototype.hasOwnProperty.call(definition.properties, key)) {
        return null;
      }
      const allowed = (
        definition.properties as Record<string, readonly string[] | "*">
      )[key];
      if (allowed === undefined) return null;
      if (typeof value !== "string" || value.length === 0) return null;
      if (value.length > MAX_PROP_VALUE_LENGTH) return null;
      if (allowed !== "*" && !allowed.includes(value)) return null;
      clean[key] = value;
    }
  }
  return { event: name as PublicEventName, props: clean };
}
