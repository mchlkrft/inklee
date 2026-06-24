// No-op stub for `server-only` / `client-only` in the vitest (non-RSC)
// environment. Those packages throw on import outside the Next server/client
// build (the HARDEN-01 fence on the service-role client uses `server-only`), so
// vitest aliases them here to keep server modules importable in tests.
export {};
