import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mechanism-wide sweep, structural finding (2026-08-02): the SAME defect
// shape recurred independently in 12+ call sites —
//
//   const { data: profile } = await supabase.from("profiles")
//     .select("settings").eq("id", user.id).single();
//   const s = profile?.settings ?? {};
//   await supabase.from("profiles").update({ settings: { ...s, oneKey: v } });
//
// Postgres `update` REPLACES the whole `settings` JSONB column; it does not
// merge. So a transient read failure collapses `s` to `{}`, and the write
// then persists an object holding ONLY the one key being changed — every
// sibling setting the artist configured elsewhere silently vanishes. The
// concrete, confirmed consequence: `parseBooksSettings(undefined)` defaults
// `books_open` to `true` (packages/shared/src/books-settings.ts), so an
// unrelated save (toggling a dashboard widget, editing a template) can
// silently REOPEN a closed artist's books with no error anywhere.
//
// This module is the fix, and it is deliberately narrow: it owns the READ
// and the distinction between "genuinely nothing here yet" (a new profile,
// where `{}` is the correct and only sensible base) and "the read failed"
// (where handing back ANY object invites exactly the bug above). The two
// functions below are the ONLY sanctioned way to read-then-write
// `profiles.settings` in this codebase; nothing else should destructure
// `data: profile` from that query and reach into `.settings` by hand.
//
// DESIGN: "make the destructive path unrepresentable, not merely guarded."
// A helper that returns `{ data, error }` and trusts the caller to check
// `error` before touching `data` has rebuilt the exact bug with one extra
// step — nothing stops a caller writing `result.data?.settings ?? {}` again.
// Instead, `merge` is a CALLBACK the helper invokes ONLY after a successful
// read, with the REAL current settings object as its only input. There is no
// return value shaped like "maybe the settings, maybe not" for a caller to
// misuse — the two outcomes are `{ ok: true, settings }` and
// `{ ok: false, error }`, a discriminated union TypeScript will not let a
// caller narrow past incorrectly (there is no `.settings` on the `ok: false`
// branch, at the type level, not just by convention).
//
// FAILURE CONTRACT: a discriminated result, not a thrown error. Every one of
// the ~20 call sites this replaces is a Next.js Server Action already
// returning `Promise<{ error: string } | { success: true } | null>` (or a
// close variant); every one of them ALREADY has an established
// `if (somethingWrong) return { error: "..." }` idiom for auth failures,
// validation failures, and other Supabase write failures in the SAME
// function. A discriminated return composes with that idiom in one line
// (`if (!result.ok) return { error: result.error }`) with no new control
// flow to learn. Throwing would single out THIS ONE read as needing
// try/catch scaffolding the other reads in the same functions don't have,
// for a failure that is no more or less recoverable than those — an
// arbitrary inconsistency, not a meaningful signal — and an uncaught throw
// from a Server Action renders Next's generic error boundary, a materially
// worse experience than the tailored "couldn't save your settings, try
// again" these forms already show for every other failure mode.
//
// `.maybeSingle()`, not `.single()`: a genuinely absent profile row for the
// authenticated caller's OWN id is not expected in this schema (profiles.id
// mirrors the auth user's id 1:1, created at signup), but `.single()` turns
// "no row" into a PostgREST error (PGRST116) — indistinguishable from a real
// failure without extra plumbing, and it is not this module's job to decide
// whether a missing profile row is a bug elsewhere. `.maybeSingle()` reports
// a missing row as `{ data: null, error: null }`, which resolves to the same
// `{}` base every one of the 20 call sites already used for it, so behaviour
// for that (very unlikely, non-error) case is unchanged.

export type SettingsMergeResult =
  | { ok: true; settings: Record<string, unknown> }
  | { ok: false; error: string };

const SETTINGS_READ_ERROR_MESSAGE =
  "Could not read your current settings. Please try again.";

/** A merge callback is usually pure and synchronous; `createFieldAction`
 *  (bookings/form/actions.ts) is the one call site that must run a SECOND
 *  query — building a default `field_order` from existing `custom_fields` —
 *  only when `settings.field_order` is not already an array. Accepting a
 *  `Promise` here keeps that one site's real behaviour (querying, not
 *  inventing an empty default) instead of forcing a synchronous-only
 *  contract that would have quietly dropped it. */
type SettingsMerger = (
  current: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/**
 * Read `profiles.settings` for `userId` and hand it to `merge`, which must
 * return the FULL object to persist (spread the current value in yourself —
 * this function does not spread on your behalf, so a `merge` that forgets to
 * spread is visibly wrong in its own diff rather than silently "handled").
 *
 * Returns `{ ok: false, error }` WITHOUT ever calling `merge` if the read
 * fails. Does not write anything — see `updateProfileSettings` below for the
 * common case that also performs the write. This lower-level function exists
 * for the one call site (settings/profile/actions.ts) that must fold the new
 * settings object into a LARGER update touching unrelated profile columns in
 * the same statement.
 */
export async function mergeProfileSettings(
  supabase: SupabaseClient,
  userId: string,
  merge: SettingsMerger,
): Promise<SettingsMergeResult> {
  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: SETTINGS_READ_ERROR_MESSAGE };
  }

  const current = (data?.settings ?? {}) as Record<string, unknown>;
  return { ok: true, settings: await merge(current) };
}

export type SettingsUpdateResult = { ok: true } | { ok: false; error: string };

/**
 * The common case: read, merge, and write `profiles.settings` in one call.
 * `extraColumns` folds additional columns into the SAME update statement
 * (most call sites also stamp `updated_at`; a few do not, and this function
 * preserves whichever behaviour the caller asks for rather than opinionating
 * on it — see the sweep report for the inventory of which sites do which).
 *
 * If `merge` needs data from `current` beyond what it returns as the new
 * settings object (an audit-log "did this actually change" comparison, a
 * before/after list for post-write cleanup), capture it via a closure
 * variable assigned inside `merge` — it runs synchronously before this
 * function returns, so the value is available to the caller immediately
 * after `await`. This keeps the callback's own type trivial (a pure
 * `Record<string, unknown> -> Record<string, unknown>` function) rather than
 * growing a generic "meta" parameter no caller needed before this rule was
 * written.
 */
export async function updateProfileSettings(
  supabase: SupabaseClient,
  userId: string,
  merge: SettingsMerger,
  extraColumns?: Record<string, unknown>,
): Promise<SettingsUpdateResult> {
  const merged = await mergeProfileSettings(supabase, userId, merge);
  if (!merged.ok) return merged;

  const { error } = await supabase
    .from("profiles")
    .update({ settings: merged.settings, ...extraColumns })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
