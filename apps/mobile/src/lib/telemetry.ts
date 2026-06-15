// Central error sink. Today it logs in dev; swap the body for Sentry
// (@sentry/react-native `captureException`) once a DSN is provisioned — call
// sites (the root ErrorBoundary, any try/catch that wants reporting) won't
// change. Keep payloads PII-free: no client names, emails, or tattoo details.

export function captureError(error: unknown, context?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  if (__DEV__) {
    console.error("[telemetry] captureError:", err.message, context ?? {});
  }
  // TODO(Sentry): Sentry.captureException(err, { extra: context });
}
