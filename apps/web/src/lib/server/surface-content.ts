import "server-only";
import {
  parseSurfaceContentSettings,
  resolveSurfaceContent as pureResolve,
  DEFAULT_SURFACE_CONTENT,
  type SurfaceContent,
  type SurfaceContentSurface,
} from "@inklee/shared/surface-content";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { richContentBlocksAllowed } from "./entitlement-gates";

// The server half of surface content configuration (founder ruling FD10,
// 2026-08-01). Mirrors appearance.ts's surfaceAppearance exactly: resolve
// what is stored, apply the entitlement boundary, hand back what a page
// needs to render.
//
// ENTITLEMENT BOUNDARY: unlike appearance (where Free keeps a legacy-
// equivalent subset — preset accent, cover image, light theme), there is no
// Free-tier equivalent of surface content. Hero media, an intro line, and
// featured collections are ALL enrichment additions FD9 explicitly leaves to
// Plus ("basic visibility controls stay Free forever... Plus may own
// advanced merchandising only") — the artist's basic shop (products, prices,
// buy button) is untouched either way. So an unentitled artist's effective
// content is the full DEFAULT_SURFACE_CONTENT, not a partial view.
//
// FAIL-SAFE like surfaceAppearance: a plan-read blip renders the default
// (empty) content rather than 500ing a public page over a cosmetic gate. A
// downgrade never deletes the artist's stored configuration — only this
// render-time view hides it (bio-page.ts's gallery posture, decision D2,
// reused here): parseSurfaceContentSettings has no entitlement awareness at
// all, so the settings row keeps whatever the artist configured.

/**
 * Resolve one artist's CONTENT configuration for one surface.
 *
 * `settings` is the raw `profiles.settings` object the caller already read,
 * so this adds no extra query to a public page; only the entitlement lookup
 * is additional (cached per request by getAccountOverrides' caller, same as
 * surfaceAppearance).
 */
export async function resolvedSurfaceContent(
  artistId: string,
  settings: unknown,
  surface: SurfaceContentSurface,
): Promise<SurfaceContent> {
  const root = (settings ?? {}) as Record<string, unknown>;
  const parsed = parseSurfaceContentSettings(root.surface_content);
  const stored = pureResolve(parsed, surface);

  let entitled = false;
  try {
    entitled = richContentBlocksAllowed(await getAccountOverrides(artistId));
  } catch {
    entitled = false; // fail-safe: default (empty) view, never a 500
  }

  return entitled
    ? stored
    : { ...DEFAULT_SURFACE_CONTENT, featuredCollectionIds: [] };
}
