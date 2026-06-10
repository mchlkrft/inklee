import * as Sentry from "@sentry/nextjs";

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
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
