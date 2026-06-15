// Re-export shim: canonical source lives in @inklee/shared (packages/shared),
// so the web public page, the web editor, and the native app editor all share
// one definition. Kept so existing "@/lib/bio-page-settings" imports across
// apps/web resolve unchanged.
export * from "@inklee/shared/bio-page";
