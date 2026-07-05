// The support FAQ content now lives in @inklee/shared so the web page and the
// native support screen render the exact same questions and answers (one source
// of truth). This shim keeps the `@/lib/support-faq` import path stable.
export * from "@inklee/shared/support-faq";
