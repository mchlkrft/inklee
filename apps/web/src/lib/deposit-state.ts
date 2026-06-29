// Re-export shim: canonical source lives in @inklee/shared (packages/shared).
// Kept so existing "@/lib/deposit-state" imports across apps/web resolve
// unchanged. The classifier is single-sourced so web + native can't drift.
export * from "@inklee/shared/deposit-state";
