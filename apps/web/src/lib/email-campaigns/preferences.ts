// Campaign email preferences. Stored in profiles.settings JSONB under
//   settings.email_prefs = { marketing: boolean, lifecycle: boolean }
// An ABSENT key means opted-IN (default true) — a fresh account receives marketing and
// lifecycle mail until it explicitly opts out. Only marketing and lifecycle are opt-out-able;
// transactional email is never opt-out-able here (account-level hard suppression via
// email_suppressions is the only thing that stops it). Kept strictly separate from
// settings.disabled_emails, which is an artist muting the mail they send to their OWN
// customers — a different preference system entirely.
import "server-only";
import { serviceClient } from "@/lib/supabase/service";

export type EmailCategory = "marketing" | "lifecycle" | "transactional";
export type OptOutableCategory = "marketing" | "lifecycle";

type EmailPrefs = { marketing?: boolean; lifecycle?: boolean };

/**
 * Is this artist opted OUT of the given category? Reads profiles.settings.email_prefs.
 * Transactional is never opted out here. Absent key = opted in (returns false).
 */
export function isOptedOut(
  settings: unknown,
  category: EmailCategory,
): boolean {
  if (category === "transactional") return false;
  const prefs = ((settings ?? {}) as Record<string, unknown>).email_prefs as
    | EmailPrefs
    | undefined;
  if (!prefs) return false; // absent = opted in
  return prefs[category] === false;
}

/**
 * Read the effective marketing/lifecycle opt-in state from a settings blob (absent = true).
 * Convenience for the unsubscribe page which needs the current toggle positions.
 */
export function readEmailPrefs(settings: unknown): {
  marketing: boolean;
  lifecycle: boolean;
} {
  return {
    marketing: !isOptedOut(settings, "marketing"),
    lifecycle: !isOptedOut(settings, "lifecycle"),
  };
}

/**
 * Set one opt-out-able category flag, MERGING into profiles.settings — the whole settings
 * object is spread so we never clobber sibling keys (reminder_settings, books_settings,
 * disabled_emails, ...). Mirrors the settings-merge idiom in settings/reminders/actions.ts.
 * `enabled=true` means opted-in; `false` means opted-out.
 */
export async function setEmailPref(
  artistId: string,
  category: OptOutableCategory,
  enabled: boolean,
): Promise<void> {
  await setEmailPrefs(artistId, { [category]: enabled });
}

/**
 * Set both category flags in ONE read+merge round trip. When any category actually flips
 * from opted-in to opted-out, an 'unsubscribed' analytics event is recorded HERE — the one
 * seam every unsubscribe surface flows through — so a re-save of an existing opt-out never
 * counts twice and a future surface cannot forget to record it.
 */
export async function setEmailPrefs(
  artistId: string,
  prefs: Partial<Record<OptOutableCategory, boolean>>,
): Promise<{ optedOutNow: boolean }> {
  const { data, error: readErr } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .single();
  if (readErr) throw readErr;

  const currentSettings = (data?.settings ?? {}) as Record<string, unknown>;
  const currentPrefs = (currentSettings.email_prefs ?? {}) as EmailPrefs;

  let optedOutNow = false;
  for (const category of ["marketing", "lifecycle"] as const) {
    const next = prefs[category];
    if (next === false && currentPrefs[category] !== false) optedOutNow = true;
  }

  const { error } = await serviceClient
    .from("profiles")
    .update({
      settings: {
        ...currentSettings,
        email_prefs: { ...currentPrefs, ...prefs },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", artistId);
  if (error) throw error;
  if (optedOutNow) await recordUnsubscribeEvent();
  return { optedOutNow };
}

/**
 * Record an 'unsubscribed' analytics event (Email hub slice 10). Resend has no unsubscribe
 * event, so it is recorded at the setEmailPrefs seam; there is no message id, so it counts
 * globally rather than per campaign. Best-effort: an insert failure is logged and swallowed —
 * analytics must never break an unsubscribe.
 */
async function recordUnsubscribeEvent(): Promise<void> {
  const { error } = await serviceClient.from("email_events").insert({
    event_type: "unsubscribed",
    occurred_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[email-prefs] unsubscribe event insert failed", {
      reason: error.message,
    });
  }
}
