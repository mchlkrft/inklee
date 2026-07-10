"use server";

// Server actions for the public /unsubscribe/[token] page. Both re-resolve the artist from
// the token server-side (never trust a client-supplied artist id) and merge into
// profiles.settings.email_prefs. No auth: possession of the durable token is the capability.
import { lookupUnsubToken } from "@/lib/email-campaigns/unsubscribe-token";
import {
  setEmailPrefs,
  recordUnsubscribeEvent,
} from "@/lib/email-campaigns/preferences";

export type UnsubResult =
  | { ok: true; marketing: boolean; lifecycle: boolean }
  | { error: string };

/** Save the two category toggles for the token's artist. */
export async function savePreferencesAction(
  token: string,
  marketing: boolean,
  lifecycle: boolean,
): Promise<UnsubResult> {
  const found = await lookupUnsubToken(token);
  if (!found) return { error: "This link is no longer valid." };
  const { optedOutNow } = await setEmailPrefs(found.artistId, {
    marketing,
    lifecycle,
  });
  if (optedOutNow) await recordUnsubscribeEvent();
  return { ok: true, marketing, lifecycle };
}

/** One-click: opt the token's artist out of all opt-out-able categories. */
export async function unsubscribeAllAction(
  token: string,
): Promise<UnsubResult> {
  const found = await lookupUnsubToken(token);
  if (!found) return { error: "This link is no longer valid." };
  const { optedOutNow } = await setEmailPrefs(found.artistId, {
    marketing: false,
    lifecycle: false,
  });
  if (optedOutNow) await recordUnsubscribeEvent();
  return { ok: true, marketing: false, lifecycle: false };
}
