// Re-export shim: canonical source lives in @inklee/shared (packages/shared).
// Kept so existing "@/lib/reminder-settings" imports across apps/web resolve
// unchanged. (ME-10 D3)
export * from "@inklee/shared/reminder-settings";
