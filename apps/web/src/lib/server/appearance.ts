import "server-only";
import {
  parseAppearance,
  resolveAppearance,
  appearanceCssVars,
  DEFAULT_APPEARANCE,
  type AppearanceSurface,
  type ResolvedAppearance,
} from "@inklee/shared/appearance";
import { COVER_COLORS } from "@inklee/shared/cover-colors";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { appearanceCustomAllowed } from "./entitlement-gates";

// The server half of the shared appearance system (Plus build P1).
//
// Resolves an artist's effective appearance for one public surface, applies
// the entitlement boundary, and hands back everything a page needs to render:
// the theme (for the existing `data-appearance` attribute) and the CSS custom
// properties (for the wrapper's style).
//
// ENTITLEMENT BOUNDARY, precisely: Free keeps what it has today, which is the
// preset cover color, the cover image, and the light theme. The Plus-only part
// is the CUSTOM layer: typography, button treatment, per-surface overrides,
// and a non-preset accent. Downgrading therefore never blanks a page; it falls
// back to the legacy-equivalent appearance, and the stored configuration is
// retained for a later re-upgrade.
//
// FAIL-SAFE like publicBrandingHidden: a plan-read blip renders the Free
// appearance rather than 500ing a public page over a cosmetic gate.

export type SurfaceAppearance = {
  /** For the wrapper's `data-appearance` attribute. */
  theme: ResolvedAppearance["theme"];
  /** For the wrapper's `style` prop. Empty when nothing was customized. */
  cssVars: Record<string, string>;
  /** The full resolved values, for surfaces that need more than tokens. */
  resolved: ResolvedAppearance;
};

/** The Free-tier view of a stored appearance: the legacy-equivalent fields
 *  only. Everything the custom layer adds falls back to the default. */
function freeTierView(resolved: ResolvedAppearance): ResolvedAppearance {
  return {
    // Everything not listed below falls back to the default, which includes
    // the `clean` template: Free gets ONE fixed layout, and it is a real
    // designed template rather than a stripped one (spec section 3).
    ...DEFAULT_APPEARANCE,
    // Kept on Free because these are exactly today's free features.
    theme: resolved.theme,
    accent: resolved.accent,
    backgroundImageUrl: resolved.backgroundImageUrl,
  };
}

/**
 * Resolve one artist's appearance for one surface.
 *
 * `settings` is the raw `profiles.settings` object the caller already read, so
 * this adds no query to a public page; only the entitlement lookup is extra
 * (and that is already cached per request by getAccountOverrides' caller).
 */
export async function surfaceAppearance(
  artistId: string,
  settings: unknown,
  surface: AppearanceSurface,
): Promise<SurfaceAppearance> {
  const parsed = parseAppearance(settings);
  const resolved = resolveAppearance(parsed, surface);

  let entitled = false;
  try {
    entitled = appearanceCustomAllowed(await getAccountOverrides(artistId));
  } catch {
    entitled = false; // fail-safe: Free view, never a 500
  }

  const effective = entitled ? resolved : freeTierView(resolved);
  return {
    theme: effective.theme,
    cssVars: appearanceCssVars(effective, COVER_COLORS),
    resolved: effective,
  };
}
