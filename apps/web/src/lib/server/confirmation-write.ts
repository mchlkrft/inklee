import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseConfirmationPage,
  CONFIRMATION_HEADLINE_MAX,
  CONFIRMATION_MESSAGE_MAX,
  CONFIRMATION_LINK_LABEL_MAX,
  type ConfirmationPageSettings,
} from "@inklee/shared/confirmation-page";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { formCustomAllowed } from "./entitlement-gates";

// The ONE write path for the custom confirmation page (Plus build P3d),
// shared by the web action and the mobile route, same discipline as
// saveAppearanceCore: entitlement refused server-side rather than hidden in
// the UI, and a MERGE into profiles.settings so sibling keys survive.

export type ConfirmationInput = {
  headline?: unknown;
  message?: unknown;
  linkUrl?: unknown;
  linkLabel?: unknown;
};

export type ConfirmationWriteResult =
  | { ok: true; settings: ConfirmationPageSettings }
  | { ok: false; error: string; code: "not_entitled" | "invalid" | "failed" };

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export async function saveConfirmationCore(
  supabase: SupabaseClient,
  artistId: string,
  input: ConfirmationInput,
): Promise<ConfirmationWriteResult> {
  try {
    if (!formCustomAllowed(await getAccountOverrides(artistId))) {
      return {
        ok: false,
        code: "not_entitled",
        error: "A custom confirmation page isn't included in your plan.",
      };
    }
  } catch {
    // Refuse the WRITE on an unverified plan, unlike the render path which
    // fails safe to the default page. Same reasoning as saveAppearanceCore.
    return {
      ok: false,
      code: "failed",
      error: "Couldn't verify your plan. Please try again.",
    };
  }

  const linkUrlRaw = str(input.linkUrl, 2048);
  // Validated here as well as in the parser: the artist should be TOLD their
  // link was rejected, whereas the public parser silently drops it because a
  // client-facing page is not the place to surface a settings mistake.
  if (linkUrlRaw && !/^https?:\/\//i.test(linkUrlRaw)) {
    return {
      ok: false,
      code: "invalid",
      error: "The link must start with https://",
    };
  }

  const next: ConfirmationPageSettings = {
    headline: str(input.headline, CONFIRMATION_HEADLINE_MAX),
    message: str(input.message, CONFIRMATION_MESSAGE_MAX),
    linkUrl: linkUrlRaw,
    linkLabel: linkUrlRaw
      ? (str(input.linkLabel, CONFIRMATION_LINK_LABEL_MAX) ?? "Learn more")
      : null,
  };

  const { data: row, error: readErr } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .single();
  if (readErr || !row) {
    return { ok: false, code: "failed", error: "Couldn't load your settings." };
  }
  const settings = (row.settings ?? {}) as Record<string, unknown>;

  const { error: writeErr } = await supabase
    .from("profiles")
    .update({ settings: { ...settings, confirmation_page: next } })
    .eq("id", artistId);
  if (writeErr) {
    return { ok: false, code: "failed", error: "Couldn't save. Try again." };
  }

  // Return what the PARSER makes of the stored value, not the raw input, so
  // the caller renders back exactly what a visitor will see.
  return { ok: true, settings: parseConfirmationPage(next) };
}
