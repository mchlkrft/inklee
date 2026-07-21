import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0,

  // `onRequestError` (src/instrumentation.ts) reports every unhandled error in
  // a route handler or server action, and the default RequestData integration
  // ships the request headers with it. @sentry/core hardcodes
  // DEFAULT_INCLUDE = { cookies: true, headers: true } regardless of
  // sendDefaultPii, so without this override Sentry would receive the Supabase
  // `sb-<ref>-auth-token` cookie — the artist's access AND refresh JWT — on any
  // unhandled error. Supplying our own instance of the integration wins over
  // the default one.
  integrations: [
    Sentry.requestDataIntegration({ include: { cookies: false } }),
  ],

  beforeSend(event) {
    // Belt and braces for the credential-bearing headers `include.cookies`
    // does not cover, and for events that reach Sentry by another path.
    const headers = event.request?.headers;
    if (headers) {
      for (const key of Object.keys(headers)) {
        const k = key.toLowerCase();
        if (k === "cookie" || k === "authorization" || k === "apikey") {
          delete headers[key];
        }
      }
    }
    if (event.request?.cookies) delete event.request.cookies;
    return event;
  },
});
