// Shared Sentry noise filters. Used by BOTH Sentry inits: the server
// (`sentry.server.config.ts`, via `beforeSend`) and the browser
// (`instrumentation-client.ts`, via `ignoreErrors`). Pure and dependency-free
// so it is unit-testable without booting Sentry.
//
// WHY THIS EXISTS: on 2026-08-05 an `onRequestError` event paged us as a
// high-priority Next.js error. It was a vulnerability scanner POSTing a Joomla
// SP Page Builder exploit (`/index.php?option=com_sppagebuilder&task=
// asset.uploadCustomIcon`) at a Next.js app that runs no PHP. Next's Server
// Action resolver saw a POST with no valid action id for this deployment and
// threw "Failed to find Server Action", which surfaced as an unhandled,
// `level=error` alert. The request failed harmlessly; the only artifact was a
// false alert. Two unrelated but co-occurring noise sources are filtered here.
//
// Dropping an event changes NOTHING about the response the client receives — the
// request still 404s / 500s exactly as before. We only stop RECORDING a
// non-event so error monitoring keeps its signal.

/**
 * Next throws this when a POST carries a Server Action id that the CURRENT
 * deployment does not have. It occurs for two benign reasons and no actionable
 * one: a real user's open tab still holds an action id from the previous
 * deployment (Next recovers by reloading the route), or a bot blind-POSTs a form
 * body to a page url. Neither is a code defect, so neither should page us.
 * Exported so the browser SDK can `ignoreErrors` the same string.
 */
export const SERVER_ACTION_NOT_FOUND_MESSAGE = "Failed to find Server Action";

/**
 * Url fragments that appear only in automated exploit scans against CMS / PHP
 * stacks this app does not run. Matched case-insensitively against the full
 * request url (path AND query, since the Joomla marker lives in the query
 * string). Deliberately specific: no inkl.ee artist slug contains any of these,
 * so a real page url can never be filtered out by mistake.
 */
const PROBE_URL_FRAGMENTS = [
  ".php",
  ".aspx",
  ".asp",
  ".cgi",
  ".jsp",
  "wp-admin",
  "wp-login",
  "wp-includes",
  "wp-content",
  "xmlrpc",
  "com_sppagebuilder", // Joomla SP Page Builder upload exploit (the observed probe)
  "/administrator/", // Joomla admin
  "/.env",
  "/.git",
  "/vendor/phpunit", // CVE-2017-9841 mass-scan target
] as const;

/** True when the request url is an obvious CMS/PHP exploit probe. */
export function isExploitProbeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return PROBE_URL_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

/** True when any of the exception messages is the stale-deployment /
 *  blind-POST "Failed to find Server Action" error. */
export function isServerActionNotFound(
  messages: (string | null | undefined)[],
): boolean {
  return messages.some(
    (m) => !!m && m.includes(SERVER_ACTION_NOT_FOUND_MESSAGE),
  );
}

/**
 * Decide whether a Sentry error event is scanner / stale-deployment noise that
 * should be dropped (return `null` from `beforeSend`) rather than recorded.
 */
export function isDroppableSentryNoise(args: {
  exceptionMessages: (string | null | undefined)[];
  requestUrl: string | null | undefined;
}): boolean {
  return (
    isServerActionNotFound(args.exceptionMessages) ||
    isExploitProbeUrl(args.requestUrl)
  );
}
