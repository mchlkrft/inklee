// Session-scoped unsaved-input drafts (ME-15). A window resize or rotation can
// flip the layout class and remount a form mid-edit (pane <-> pushed route),
// and a resize cannot be vetoed with a confirm dialog — so dirty inputs
// persist here, keyed per entity, and remounts rehydrate losslessly.
// Module-level on purpose: survives navigation and remounts, dies with the JS
// session. NOT persisted to disk. clearAllDrafts() runs on signed-in user
// change (the same place the query cache clears) so one account's draft never
// leaks into another session.
//
// Deliberately plain functions, not a hook: consumers seed their local state
// from the draft on mount (draft wins over the server value), write through on
// every user edit, and clear on successful save or explicit cancel. A
// hook-owned setter can't distinguish "seed from server" from "user typed",
// which would fabricate drafts.
const drafts = new Map<string, unknown>();

export function hasDraft(key: string): boolean {
  return drafts.has(key);
}

export function getDraft<T>(key: string): T | undefined {
  return drafts.get(key) as T | undefined;
}

export function setDraft<T>(key: string, value: T) {
  drafts.set(key, value);
}

export function clearDraft(key: string) {
  drafts.delete(key);
}

export function clearAllDrafts() {
  drafts.clear();
}
