// The support-ticket domain rules now live in @inklee/shared so the native app
// consumes the exact same statuses, categories, validation, and derivations as
// the web app (one source of truth). This shim keeps the `@/lib/support` import
// path stable for the web + mobile-API code.
export * from "@inklee/shared/support";
