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
  const { data, error: readErr } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .single();
  if (readErr) throw readErr;

  const currentSettings = (data?.settings ?? {}) as Record<string, unknown>;
  const currentPrefs = (currentSettings.email_prefs ?? {}) as EmailPrefs;

  const { error } = await serviceClient
    .from("profiles")
    .update({
      settings: {
        ...currentSettings,
        email_prefs: { ...currentPrefs, [category]: enabled },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", artistId);
  if (error) throw error;
}
