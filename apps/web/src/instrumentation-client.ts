import * as Sentry from "@sentry/nextjs";
import { SERVER_ACTION_NOT_FOUND_MESSAGE } from "@/lib/sentry-noise";

// Next-native client instrumentation. This replaces the old
// sentry.client.config.ts, which was never loaded (it is only injected by the
// Sentry build wrapper, and next.config.ts is not wrapped) — so browser-side
// Sentry never initialised. Privacy-conservative: errors only, no tracing, no
// session/error replay, production-only.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // A user's tab left open across a deploy still holds the previous build's
  // Server Action ids; the next action call throws this and Next recovers by
  // reloading. Benign, unactionable, and not worth an alert. (The server side
  // filters the same string plus scanner probes; see src/lib/sentry-noise.ts.)
  ignoreErrors: [SERVER_ACTION_NOT_FOUND_MESSAGE],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
