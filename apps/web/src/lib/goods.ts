// Re-export shim: canonical source lives in @inklee/shared (packages/shared) so
// the web editor, the mobile routes and the native goods screens share one
// definition of currencies, caps and price helpers. Kept so existing
// "@/lib/goods" imports across apps/web resolve unchanged.
export * from "@inklee/shared/goods";
