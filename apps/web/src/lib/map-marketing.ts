/**
 * One source of truth for how the PUBLIC MARKETING site talks about the tattoo
 * map. Marketing pages must never hand-roll the "where does this button go"
 * decision, because it has two states and getting it wrong ships a link that
 * bounces anonymous visitors to /login.
 *
 * Two states, driven by `publicMapEnabled()` (see lib/map-features.ts):
 *
 *   signup  (today)  the public /map route does not exist. The map is described
 *                    as a capability inside Inklee and the CTA is account
 *                    creation, which is also the canonical conversion goal.
 *   explore (flip)   anonymous visitors can open /map, so the CTA becomes the
 *                    map itself and account creation moves to secondary.
 *
 * Read from SERVER components only (marketing pages are server components), so
 * the env read stays a runtime read rather than a value baked into a client
 * bundle at build time.
 *
 * Context and reasoning: docs/marketing/public-map-marketing-integration-audit.md
 * Keyword/indexation rules for /map: docs/seo/inklee-seo-strategy.md
 * ("Public tattoo map and local studio discovery").
 */

import { publicMapEnabled } from "@/lib/map-features";

/** Where a marketing surface may send a visitor for the tattoo map. */
export type MapMarketingMode = "signup" | "explore";

export type MapMarketingCta = {
  mode: MapMarketingMode;
  /** The primary button. */
  primary: { href: string; label: string; cta: string };
  /**
   * The secondary button, or null when the surface should render only one.
   * In "explore" mode this is account creation, so the conversion goal is
   * always still on the surface.
   */
  secondary: { href: string; label: string; cta: string } | null;
};

/**
 * The tattoo-map CTA pair for a marketing surface.
 *
 * @param signupCtaId  stable Plausible `cta` id for the account-creation link
 *                     (e.g. "home-map-signup")
 * @param exploreCtaId stable Plausible `cta` id for the /map link
 *                     (e.g. "home-map-explore")
 * @param signupLabel  page-appropriate account-creation wording
 */
export function mapMarketingCta(
  signupCtaId: string,
  exploreCtaId: string,
  signupLabel: string,
): MapMarketingCta {
  const signup = { href: "/signup", label: signupLabel, cta: signupCtaId };

  if (!publicMapEnabled()) {
    return { mode: "signup", primary: signup, secondary: null };
  }

  return {
    mode: "explore",
    primary: {
      href: "/map",
      label: "Open the tattoo map",
      cta: exploreCtaId,
    },
    secondary: signup,
  };
}
