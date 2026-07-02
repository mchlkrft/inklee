import "server-only";

/**
 * Server-side Plausible custom events via the public events API
 * (https://plausible.io/docs/events-api). Used where the conversion boundary
 * is a server action or API route with no browser to fire from (mobile-app
 * onboarding, slug claims). Fire-and-forget: analytics must never affect the
 * request outcome, so failures are swallowed after a short timeout.
 *
 * The caller is responsible for internal-user exclusion (ADMIN_EMAILS via
 * isAdminEmail, profiles.is_tester) — this helper just sends.
 */

const PLAUSIBLE_ENDPOINT = "https://plausible.io/api/event";
const PLAUSIBLE_DOMAIN = "inklee.app"; // matches data-domain in app/layout.tsx
const SITE_ORIGIN = "https://inklee.app";

export type ServerEventInput = {
  /** Path the event is attributed to, e.g. "/onboarding/claim-slug". */
  path: string;
  /** Prop values are stable labels only — never personal data. */
  props?: Record<string, string>;
  /** Incoming request headers; user-agent and client IP are forwarded so
   *  Plausible can derive device and country without any custom props. */
  headers: Headers;
};

export function trackServerEvent(event: string, input: ServerEventInput): void {
  const userAgent = input.headers.get("user-agent") ?? "";
  const forwardedFor =
    input.headers.get("x-forwarded-for") ?? input.headers.get("x-real-ip");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": userAgent,
  };
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;

  void fetch(PLAUSIBLE_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: event,
      url: `${SITE_ORIGIN}${input.path}`,
      domain: PLAUSIBLE_DOMAIN,
      props: input.props,
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch((error) => {
    console.error(`[track-server] ${event} failed`, error);
  });
}
