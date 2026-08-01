import { revalidatePath } from "next/cache";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseBioPageSettings } from "@/lib/bio-page-settings";
import {
  gateMediaBlocksForSave,
  preserveGoodsDestinationOnSave,
} from "@inklee/shared/bio-page";
import { listCollectionsForArtist } from "@/lib/server/collections";
import { liveCollections } from "@inklee/shared/collections";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { richContentBlocksAllowed } from "@/lib/server/entitlement-gates";
import { goodsDestinationAvailability } from "@/lib/goods-visibility";
import { removeDroppedHubImages } from "@/lib/server/hub-images";

export const runtime = "nodejs";

// GET /api/mobile/settings/hub — the artist's Inklee Hub (bio page) config for the
// native editor. Reads profiles.settings.bio_page and returns it through the SAME
// shared parser the web editor + public render use (parseBioPageSettings), so all
// three surfaces agree on shape, URL safety, length caps, module-key filtering,
// and per-platform social dedupe. One source of truth — do NOT re-derive here.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return mobileError(500, error?.message ?? "Profile not found.");
  }
  const settings = (data.settings ?? {}) as Record<string, unknown>;

  // ADDITIVE (P5d): the native editor needs names for the featured-collection
  // picker, and an id alone is not something an artist can choose between.
  // Only LIVE collections are offerable; featuring an archived one would make a
  // block that renders nothing. An older build ignores the extra key.
  const collections = liveCollections(
    await listCollectionsForArtist(supabase, userId),
  ).map((c) => ({ id: c.id, name: c.name }));

  // ADDITIVE (Stage 3): the rich blocks (image gallery) are Plus, gated on
  // their own rich_content_blocks entitlement (founder ruling FD1, 2026-08-01,
  // SUPERSEDES the earlier appearance_custom gate), so the native editor only
  // offers them to an entitled artist. An older build ignores the extra key.
  // The server enforces the boundary at render AND at save (POST below, via
  // gateMediaBlocksForSave).
  const richBlocksAllowed = richContentBlocksAllowed(
    await getAccountOverrides(userId),
  );

  // ADDITIVE (FD8, 2026-08-01): per-destination availability for the goods
  // block's picker, so the native editor can warn on an unavailable saved
  // selection instead of silently offering a dead end. An older build
  // ignores the extra key.
  const bioPage = parseBioPageSettings(settings.bio_page);
  const goodsAvailability = goodsDestinationAvailability(settings, bioPage);

  return mobileOk({
    ...bioPage,
    collections,
    richBlocksAllowed,
    goodsAvailability,
  });
}

// POST /api/mobile/settings/hub — save the Hub config. Ports the web
// saveBioPageAction: round-trip the body through parseBioPageSettings (the single
// place every field is validated + sanitized), then merge into
// profiles.settings.bio_page WITHOUT clobbering the rest of the settings JSON.
// RLS-scoped to the artist. Returns the SANITIZED settings so the native editor
// reflects exactly what was stored (dropped links, normalized URLs, deduped
// socials), matching the web form's round-trip.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  // Guard against a malformed body silently resetting the whole config: the
  // parser treats any non-object as DEFAULT_BIO_PAGE, which would wipe it.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return mobileError(400, "Invalid request body.");
  }

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = (profile.settings ?? {}) as Record<string, unknown>;
  const currentBio = parseBioPageSettings(current.bio_page);

  // The Link Hub editor owns ONLY blocks + socials; bookingPolicy + module
  // visibility (`hidden`) are edited on /bookings/settings. Pick just the hub
  // fields from the body and keep bookingPolicy/hidden from currentBio, so no
  // client (old or new) can clobber booking-page state through the hub endpoint.
  // One shared parser validates everything (including the per-type block caps).
  const body = raw as Record<string, unknown>;
  const parsed = parseBioPageSettings({
    ...currentBio,
    blocks: body.blocks,
    socials: body.socials,
  });

  // FD8 WIRE-SAFETY, identical reasoning to the web action: an old app build
  // that predates the goods block's destination field must not reset an
  // artist's existing explicit choice merely by resaving an unrelated field.
  const goodsSafeBlocks = preserveGoodsDestinationOnSave(
    Array.isArray(body.blocks) ? body.blocks : [],
    parsed.blocks,
    currentBio.blocks,
  );

  // SAVE-PATH ENTITLEMENT GATE, identical to the web action: a NEW or CHANGED
  // image_gallery block is refused for an artist without rich_content_blocks
  // (founder ruling FD1, 2026-08-01, SUPERSEDES the earlier appearance_custom
  // gate), an unchanged one is kept (decision D2). Fail-safe to unentitled on a
  // plan-read blip so a Free client cannot persist a gallery.
  let entitled = false;
  try {
    entitled = richContentBlocksAllowed(await getAccountOverrides(userId));
  } catch {
    entitled = false;
  }
  const { blocks: gatedBlocks } = gateMediaBlocksForSave(
    goodsSafeBlocks,
    currentBio.blocks,
    entitled,
  );
  const settings = { ...parsed, blocks: gatedBlocks };

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, bio_page: settings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  // Orphan cleanup AFTER the write won, identical to the web action: dropped
  // hosted gallery objects are removed, everything else re-validated away.
  await removeDroppedHubImages(userId, currentBio.blocks, settings.blocks);

  // The public Hub (/<slug>/hub) is server-rendered; bust its cache so an edit
  // from the app shows immediately, mirroring saveBioPageAction's revalidate.
  if (profile.slug) revalidatePath(`/${profile.slug}/hub`);

  return mobileOk(settings);
}
