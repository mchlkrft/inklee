import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
}

// Capture uncaught errors in App Router route handlers AND server actions.
// Without this, only the ~24 explicit captureException call sites reported to
// Sentry; the Stripe webhook, the three crons, every /api/mobile route, and the
// auth actions were invisible to error monitoring.
export const onRequestError = Sentry.captureRequestError;
