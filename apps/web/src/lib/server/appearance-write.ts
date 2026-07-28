import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseAppearance,
  isAppearanceTheme,
  isAppearanceFontId,
  isButtonTreatment,
  isButtonRadius,
  isAppearanceSurface,
  type AppearanceSettings,
  type AppearanceSurface,
} from "@inklee/shared/appearance";
import { sanitizeCoverColor } from "@inklee/shared/cover-colors";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { appearanceCustomAllowed } from "./entitlement-gates";

// The ONE write path for appearance settings (Plus build P1b), shared by the
// web settings action and the mobile route so the two surfaces enforce the
// identical truth (the deposits-gate drift lesson).
//
// Entitlement: saving the CUSTOM layer is Plus. Refused server-side, not
// hidden in the UI. The Free-editable fields (theme, preset accent, background
// image) live in their existing profile surfaces and are untouched here.
//
// Writes MERGE into profiles.settings, never replace it: sibling keys
// (bio_page, books_settings, deposit_defaults, cover_*) must survive, which is
// the same merge-write discipline link-hub/actions.ts uses.

export type AppearanceInput = {
  theme?: unknown;
  accent?: unknown;
  font?: unknown;
  buttonTreatment?: unknown;
  buttonRadius?: unknown;
  surface?: unknown;
};

export type AppearanceWriteResult =
  | { ok: true; settings: AppearanceSettings }
  | { ok: false; error: string; code: "not_entitled" | "invalid" | "failed" };

/** Normalize untrusted input into the stored shape. Unknown values are
 *  DROPPED rather than rejected, matching every other settings parser here:
 *  a stale client must never be able to fail a whole save. */
function normalize(input: AppearanceInput) {
  const out: Record<string, unknown> = {};
  if (isAppearanceTheme(input.theme)) out.theme = input.theme;
  if ("accent" in input) out.accent = sanitizeCoverColor(input.accent);
  if (isAppearanceFontId(input.font)) out.font = input.font;
  if (isButtonTreatment(input.buttonTreatment))
    out.buttonTreatment = input.buttonTreatment;
  if (isButtonRadius(input.buttonRadius)) out.buttonRadius = input.buttonRadius;
  return out;
}

/**
 * Save an appearance change for an artist, to the global appearance or to one
 * surface override. Returns the parsed result so a caller can render it back
 * without a second read.
 */
export async function saveAppearanceCore(
  supabase: SupabaseClient,
  artistId: string,
  input: AppearanceInput,
): Promise<AppearanceWriteResult> {
  try {
    if (!appearanceCustomAllowed(await getAccountOverrides(artistId))) {
      return {
        ok: false,
        code: "not_entitled",
        error: "Custom appearance isn't included in your current plan.",
      };
    }
  } catch {
    // Plan-read blip: refuse the WRITE (unlike the render path, which fails
    // safe to the free view). Writing an entitled-only shape on an unverified
    // plan is the worse error; the artist can retry.
    return {
      ok: false,
      code: "failed",
      error: "Couldn't verify your plan. Please try again.",
    };
  }

  const patch = normalize(input);
  if (Object.keys(patch).length === 0) {
    return { ok: false, code: "invalid", error: "Nothing to save." };
  }

  const target: AppearanceSurface | null = isAppearanceSurface(input.surface)
    ? input.surface
    : null;

  const { data: row, error: readErr } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .single();
  if (readErr || !row) {
    return { ok: false, code: "failed", error: "Couldn't load your settings." };
  }

  const settings = (row.settings ?? {}) as Record<string, unknown>;
  // Parse the CURRENT state (incl. legacy read-through) so the first save
  // durably captures what the artist already had, instead of resetting it.
  const current = parseAppearance(settings);

  const next: AppearanceSettings = target
    ? {
        global: current.global,
        surfaces: {
          ...current.surfaces,
          [target]: { ...(current.surfaces[target] ?? {}), ...patch },
        },
      }
    : {
        global: { ...current.global, ...patch },
        surfaces: current.surfaces,
      };

  const { error: writeErr } = await supabase
    .from("profiles")
    .update({ settings: { ...settings, appearance: next } })
    .eq("id", artistId);
  if (writeErr) {
    return { ok: false, code: "failed", error: "Couldn't save. Try again." };
  }

  return { ok: true, settings: next };
}
