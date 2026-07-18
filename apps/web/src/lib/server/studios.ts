import "server-only";
import { randomUUID } from "node:crypto";
import { serviceClient } from "@/lib/supabase/service";
import { guardedSharp } from "@/lib/image-guard";
import { processImage } from "@/lib/image-processing";
import { sanitizeBioLinkUrl } from "@inklee/shared/bio-page";
import {
  CLAIMANT_ROLES,
  CLAIM_ADDRESS_MAX,
  CLAIM_EVIDENCE_MAX,
  CLAIM_SOCIAL_LINK_MAX,
  MAX_STUDIO_PHOTOS,
  MIN_STUDIO_CATEGORIES,
  STUDIO_STANDARD_CATEGORIES,
  computeStudioCompleteness,
  isOwnedStudioMediaPath,
  studioLogoStoragePath,
  studioPhotoStoragePath,
  sortHouseRules,
  validateCustomCategory,
  validateHouseRules,
  validateStudioProfileInput,
  type ClaimantRole,
  type HouseRuleInput,
  type StudioCompleteness,
  type StudioProfileInput,
  type StudioStandardCategory,
} from "@inklee/shared/studio-profile";
import { checkClaimRateLimit } from "@/lib/ratelimit";
import {
  scanForDuplicates,
  persistDuplicateSuggestions,
} from "@/lib/server/map-duplicates";
import type { DuplicateHit } from "@inklee/shared/map-directory";

// Studio owner server core (Inklee 2.0 Phase 3). Every studio mutation runs
// here through the service role AFTER an explicit ownership check, because the
// studio tables grant owners SELECT only (migration 0078). publication_status
// is never client-settable; it changes only through the publish transition,
// which re-checks the locked minimums.

export type StudioCategoryInput =
  | { kind: "style"; key: string }
  | { kind: "standard"; key: string }
  | { kind: "custom"; label: string };

export type OwnedStudio = {
  id: string;
  name: string;
  description: string | null;
  vibe: string | null;
  logoPath: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  addressVisibility: string;
  guestSpotStatus: string;
  publicationStatus: string;
  socialLinks: string[];
  mapLocationId: string | null;
  mapModerationStatus: string | null;
  categories: Array<{
    id: string;
    kind: string;
    styleKey: string | null;
    standardKey: string | null;
    customLabel: string | null;
  }>;
  photoCount: number;
  completeness: StudioCompleteness;
};

function readSocialLinks(settings: unknown): string[] {
  if (settings && typeof settings === "object" && "social_links" in settings) {
    const raw = (settings as { social_links?: unknown }).social_links;
    if (Array.isArray(raw))
      return raw.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export async function getOwnedStudio(
  userId: string,
): Promise<OwnedStudio | null> {
  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select(
      "id, name, description, vibe, logo_path, address, city, country, postal_code, address_visibility, guest_spot_status, publication_status, settings",
    )
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (!studio) return null;

  const [
    { data: cats },
    { count: photoCount },
    { data: mapLoc },
    { count: houseRuleCount },
  ] = await Promise.all([
    serviceClient
      .from("studio_categories")
      .select("id, kind, style_key, standard_key, custom_label")
      .eq("studio_profile_id", studio.id as string),
    serviceClient
      .from("studio_photos")
      .select("id", { count: "exact", head: true })
      .eq("studio_profile_id", studio.id as string),
    serviceClient
      .from("map_locations")
      .select("id, moderation_status")
      .eq("studio_profile_id", studio.id as string)
      .maybeSingle(),
    serviceClient
      .from("studio_house_rules")
      .select("id", { count: "exact", head: true })
      .eq("studio_profile_id", studio.id as string),
  ]);

  const categories = (cats ?? []).map((c) => ({
    id: c.id as string,
    kind: c.kind as string,
    styleKey: (c.style_key as string | null) ?? null,
    standardKey: (c.standard_key as string | null) ?? null,
    customLabel: (c.custom_label as string | null) ?? null,
  }));
  const completeness = computeStudioCompleteness({
    hasLogo: Boolean(studio.logo_path),
    photoCount: photoCount ?? 0,
    hasDescription: Boolean((studio.description as string | null)?.trim()),
    hasAddress: Boolean((studio.address as string | null)?.trim()),
    categoryCount: categories.length,
    hasVibe: Boolean((studio.vibe as string | null)?.trim()),
    houseRuleCount: houseRuleCount ?? 0,
  });

  return {
    id: studio.id as string,
    name: studio.name as string,
    description: (studio.description as string | null) ?? null,
    vibe: (studio.vibe as string | null) ?? null,
    logoPath: (studio.logo_path as string | null) ?? null,
    address: (studio.address as string | null) ?? null,
    city: (studio.city as string | null) ?? null,
    country: (studio.country as string | null) ?? null,
    postalCode: (studio.postal_code as string | null) ?? null,
    addressVisibility: studio.address_visibility as string,
    guestSpotStatus: studio.guest_spot_status as string,
    publicationStatus: studio.publication_status as string,
    socialLinks: readSocialLinks(studio.settings),
    mapLocationId: (mapLoc?.id as string | null) ?? null,
    mapModerationStatus: (mapLoc?.moderation_status as string | null) ?? null,
    categories,
    photoCount: photoCount ?? 0,
    completeness,
  };
}

export type CreateStudioInput = StudioProfileInput & {
  latitude: number;
  longitude: number;
  googlePlaceId: string | null;
  socialLink: string;
};

export type CreateStudioResult =
  | { studioId: string }
  | { error: string }
  | { duplicates: DuplicateHit[] };

export async function createStudioCore(
  userId: string,
  input: CreateStudioInput,
  ignoreDuplicates = false,
): Promise<CreateStudioResult> {
  const invalid = validateStudioProfileInput(input);
  if (invalid) return { error: invalid };

  // Elevation requirements (locked): at least one social link and an address.
  // Require an http(s) social link specifically (sanitizeBioLinkUrl also
  // accepts mailto:, but the scope wants a social MEDIA link, and this value
  // seeds the map location's website_url + the duplicate detector).
  const sanitized = sanitizeBioLinkUrl(input.socialLink);
  const social =
    sanitized && /^https?:\/\//i.test(sanitized) ? sanitized : null;
  if (!social)
    return { error: "Add at least one social media link to start a studio." };
  if (!input.address?.trim())
    return { error: "Add your studio address to start a studio." };
  if (
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180
  )
    return { error: "Pick your studio location from the address search." };

  // One studio per owner (also enforced by the DB unique constraint).
  const { data: existing } = await serviceClient
    .from("studio_profiles")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (existing) return { error: "You already run a studio." };

  const dupEntry = {
    name: input.name.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address,
    city: input.city ?? null,
    instagramHandle: null,
    websiteUrl: social,
  };
  const duplicateHits = await scanForDuplicates(dupEntry);
  if (
    !ignoreDuplicates &&
    duplicateHits.some((h) => h.confidence !== "possible")
  )
    return { duplicates: duplicateHits };

  // 1. Map location: owner-created, pending admin moderation (owner content is
  //    curated before the public map, same posture as seeds), claimed by us.
  const { data: mapLoc, error: mapErr } = await serviceClient
    .from("map_locations")
    .insert({
      source: "owner_created",
      category: "tattoo_studio",
      name: input.name.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      display_latitude: input.latitude,
      display_longitude: input.longitude,
      address: input.address.trim(),
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      postal_code: input.postalCode?.trim() || null,
      google_place_id: input.googlePlaceId?.trim() || null,
      website_url: social,
      claim_status: "claimed",
      moderation_status: "pending",
      is_seed: false,
    })
    .select("id")
    .single();
  if (mapErr) {
    if (mapErr.code === "23505")
      return { error: "This place is already on the map." };
    return { error: "Could not create your studio. Try again." };
  }

  // 2. Studio profile (draft), then 3. link the map location to it.
  const { data: studio, error: studioErr } = await serviceClient
    .from("studio_profiles")
    .insert({
      owner_user_id: userId,
      name: input.name.trim(),
      address: input.address.trim(),
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      postal_code: input.postalCode?.trim() || null,
      address_visibility: input.addressVisibility,
      guest_spot_status: input.guestSpotStatus,
      settings: { social_links: [social] },
    })
    .select("id")
    .single();
  if (studioErr) {
    // Roll back the orphaned map location.
    await serviceClient.from("map_locations").delete().eq("id", mapLoc.id);
    if (studioErr.code === "23505")
      return { error: "You already run a studio." };
    return { error: "Could not create your studio. Try again." };
  }

  // Link step: if it fails, compensate by removing both rows so the owner is
  // not left with an unlinked studio (which the one-per-owner constraint would
  // then block them from re-creating) plus an orphaned "claimed" map location.
  const { error: linkErr } = await serviceClient
    .from("map_locations")
    .update({ studio_profile_id: studio.id })
    .eq("id", mapLoc.id);
  if (linkErr) {
    await serviceClient.from("studio_profiles").delete().eq("id", studio.id);
    await serviceClient.from("map_locations").delete().eq("id", mapLoc.id);
    return { error: "Could not create your studio. Try again." };
  }

  // Persist any duplicate pairs as OPEN for admin review, even when the owner
  // chose to proceed. An owner override is not an admin dismissal, so the
  // dedup queue must still surface a near-duplicate they stood up.
  await persistDuplicateSuggestions(mapLoc.id as string, duplicateHits);

  return { studioId: studio.id as string };
}

async function ownedStudioId(
  userId: string,
  studioId: string,
): Promise<boolean> {
  const { data } = await serviceClient
    .from("studio_profiles")
    .select("id")
    .eq("id", studioId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function updateStudioProfileCore(
  userId: string,
  studioId: string,
  input: StudioProfileInput,
): Promise<{ error?: string }> {
  const invalid = validateStudioProfileInput(input);
  if (invalid) return { error: invalid };
  if (!(await ownedStudioId(userId, studioId)))
    return { error: "Not your studio." };

  const { error } = await serviceClient
    .from("studio_profiles")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      vibe: input.vibe?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      postal_code: input.postalCode?.trim() || null,
      address_visibility: input.addressVisibility,
      guest_spot_status: input.guestSpotStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", studioId);
  if (error) return { error: "Could not save your studio." };

  // Keep the linked map entry's name and address fields in step with the
  // profile so the public map never renders a stale name after a rename.
  await serviceClient
    .from("map_locations")
    .update({
      name: input.name.trim(),
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      postal_code: input.postalCode?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("studio_profile_id", studioId);
  return {};
}

const STANDARD_SET = new Set<string>(STUDIO_STANDARD_CATEGORIES);

export async function setStudioCategoriesCore(
  userId: string,
  studioId: string,
  categories: StudioCategoryInput[],
): Promise<{ error?: string }> {
  if (!(await ownedStudioId(userId, studioId)))
    return { error: "Not your studio." };

  // Validate + dedupe into insertable rows.
  const rows: Array<{
    studio_profile_id: string;
    kind: string;
    style_key: string | null;
    standard_key: string | null;
    custom_label: string | null;
  }> = [];
  const seen = new Set<string>();
  const styleKeys = categories
    .filter((c): c is { kind: "style"; key: string } => c.kind === "style")
    .map((c) => c.key);
  const validStyles = new Set<string>();
  if (styleKeys.length) {
    const { data } = await serviceClient
      .from("styles")
      .select("key")
      .in("key", styleKeys);
    for (const s of data ?? []) validStyles.add(s.key as string);
  }

  for (const cat of categories) {
    if (cat.kind === "style") {
      if (!validStyles.has(cat.key))
        return { error: "Pick styles from the list." };
      const dedupe = `style:${cat.key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      rows.push({
        studio_profile_id: studioId,
        kind: "standard",
        style_key: cat.key,
        standard_key: null,
        custom_label: null,
      });
    } else if (cat.kind === "standard") {
      if (!STANDARD_SET.has(cat.key))
        return { error: "Pick categories from the list." };
      const dedupe = `standard:${cat.key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      rows.push({
        studio_profile_id: studioId,
        kind: "standard",
        style_key: null,
        standard_key: cat.key as StudioStandardCategory,
        custom_label: null,
      });
    } else {
      const bad = validateCustomCategory(cat.label);
      if (bad) return { error: bad };
      const label = cat.label.trim();
      const dedupe = `custom:${label.toLowerCase()}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      rows.push({
        studio_profile_id: studioId,
        kind: "custom",
        style_key: null,
        standard_key: null,
        custom_label: label,
      });
    }
  }

  // Replace the set as a DIFF so it never empties (and never hits the distinct
  // unique indexes by re-inserting a row that already exists): insert only the
  // genuinely new categories, delete only the ones no longer chosen. A canonical
  // identity string per row drives both sides.
  const identity = (r: (typeof rows)[number]): string =>
    r.style_key
      ? `style:${r.style_key}`
      : r.standard_key
        ? `standard:${r.standard_key}`
        : `custom:${(r.custom_label ?? "").toLowerCase()}`;
  const desired = new Map(rows.map((r) => [identity(r), r]));

  const { data: existing, error: exErr } = await serviceClient
    .from("studio_categories")
    .select("id, style_key, standard_key, custom_label")
    .eq("studio_profile_id", studioId);
  if (exErr) return { error: "Could not save your categories." };
  const existingIdentities = new Set<string>();
  const toDelete: string[] = [];
  for (const row of existing ?? []) {
    const id = row.style_key
      ? `style:${row.style_key}`
      : row.standard_key
        ? `standard:${row.standard_key}`
        : `custom:${((row.custom_label as string | null) ?? "").toLowerCase()}`;
    existingIdentities.add(id);
    if (!desired.has(id)) toDelete.push(row.id as string);
  }
  const toInsert = [...desired.entries()]
    .filter(([id]) => !existingIdentities.has(id))
    .map(([, r]) => r);

  if (toInsert.length) {
    const { error: insErr } = await serviceClient
      .from("studio_categories")
      .insert(toInsert);
    if (insErr) return { error: "Could not save your categories." };
  }
  if (toDelete.length) {
    const { error: delErr } = await serviceClient
      .from("studio_categories")
      .delete()
      .in("id", toDelete);
    if (delErr) return { error: "Could not save your categories." };
  }
  await serviceClient
    .from("studio_profiles")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", studioId);
  return {};
}

// ---------------------------------------------------------------------------
// House rules (Phase 4 extension): typed, reusable studio-level rules shown
// to requesting artists and reused by the welcome pack later.

export type HouseRule = { key: string; content: string };

/** The owner's rules, in canonical vocabulary order. */
export async function getHouseRulesForOwner(
  userId: string,
  studioId: string,
): Promise<HouseRule[] | null> {
  if (!(await ownedStudioId(userId, studioId))) return null;
  const { data } = await serviceClient
    .from("studio_house_rules")
    .select("rule_key, content")
    .eq("studio_profile_id", studioId);
  return sortHouseRules(
    (data ?? []).map((r) => ({
      key: r.rule_key as string,
      content: r.content as string,
    })),
  );
}

/**
 * A published studio's rules for artist-facing display (map detail, request
 * pages). Returns [] for unpublished studios so drafts never leak.
 */
export async function getPublishedHouseRules(
  studioProfileId: string,
): Promise<HouseRule[]> {
  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select("publication_status")
    .eq("id", studioProfileId)
    .maybeSingle();
  if (studio?.publication_status !== "published") return [];
  const { data } = await serviceClient
    .from("studio_house_rules")
    .select("rule_key, content")
    .eq("studio_profile_id", studioProfileId);
  return sortHouseRules(
    (data ?? []).map((r) => ({
      key: r.rule_key as string,
      content: r.content as string,
    })),
  );
}

/** Replace the rule set as a diff (the categories pattern: never empties). */
export async function setHouseRulesCore(
  userId: string,
  studioId: string,
  rules: HouseRuleInput[],
): Promise<{ error?: string }> {
  if (!(await ownedStudioId(userId, studioId)))
    return { error: "Not your studio." };
  const invalid = validateHouseRules(rules);
  if (invalid) return { error: invalid };

  const desired = new Map(rules.map((r) => [r.key, r.content.trim()]));
  const { data: existing, error: exErr } = await serviceClient
    .from("studio_house_rules")
    .select("id, rule_key, content")
    .eq("studio_profile_id", studioId);
  if (exErr) return { error: "Could not save your house rules." };

  const existingByKey = new Map(
    (existing ?? []).map((r) => [
      r.rule_key as string,
      { id: r.id as string, content: r.content as string },
    ]),
  );
  const toInsert = [...desired.entries()]
    .filter(([key]) => !existingByKey.has(key))
    .map(([key, content]) => ({
      studio_profile_id: studioId,
      rule_key: key,
      content,
    }));
  const toUpdate = [...desired.entries()]
    .filter(([key, content]) => {
      const current = existingByKey.get(key);
      return current !== undefined && current.content !== content;
    })
    .map(([key, content]) => ({
      id: existingByKey.get(key)!.id,
      content,
    }));
  const toDelete = [...existingByKey.entries()]
    .filter(([key]) => !desired.has(key))
    .map(([, row]) => row.id);

  if (toInsert.length) {
    const { error } = await serviceClient
      .from("studio_house_rules")
      .insert(toInsert);
    if (error) return { error: "Could not save your house rules." };
  }
  for (const row of toUpdate) {
    const { error } = await serviceClient
      .from("studio_house_rules")
      .update({ content: row.content, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return { error: "Could not save your house rules." };
  }
  if (toDelete.length) {
    const { error } = await serviceClient
      .from("studio_house_rules")
      .delete()
      .in("id", toDelete);
    if (error) return { error: "Could not save your house rules." };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Studio media (the private studio-media bucket). Writes are service-role
// only; reads happen through short-lived signed URLs so draft, hidden, or
// suspended studios never leak media at stable public URLs.

const STUDIO_MEDIA_BUCKET = "studio-media";
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel body-cap headroom
const ALLOWED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function validateUploadFile(file: File): string | null {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type))
    return "Use a PNG, JPG, or WebP image.";
  if (file.size > MAX_UPLOAD_BYTES) return "Images must be under 4 MB.";
  return null;
}

/** Batch-sign media paths for owner or shaper rendering (order-preserving). */
export async function signStudioMediaPaths(
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await serviceClient.storage
    .from(STUDIO_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) {
    // Callers render unsigned entries as placeholders; log so a batch
    // signing outage is visible rather than silently degrading.
    console.error("[studios] media signing failed:", error.message);
    return new Map();
  }
  const urls = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

export type StudioMedia = {
  logoUrl: string | null;
  // url is null when signing failed or the object is missing; the row still
  // counts toward the cap and the publish gate, so the UI must render it (as
  // a placeholder with its delete button), never hide it.
  photos: Array<{ id: string; url: string | null; position: number }>;
};

/** Owner view of the studio's media, with fresh signed URLs. */
export async function getStudioMediaForOwner(
  userId: string,
  studioId: string,
): Promise<StudioMedia | null> {
  if (!(await ownedStudioId(userId, studioId))) return null;
  const [{ data: studio }, { data: photoRows }] = await Promise.all([
    serviceClient
      .from("studio_profiles")
      .select("logo_path")
      .eq("id", studioId)
      .maybeSingle(),
    serviceClient
      .from("studio_photos")
      .select("id, storage_path, position")
      .eq("studio_profile_id", studioId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const logoPath = (studio?.logo_path as string | null) ?? null;
  const photoPaths = (photoRows ?? []).map((p) => p.storage_path as string);
  const urls = await signStudioMediaPaths([
    ...(logoPath ? [logoPath] : []),
    ...photoPaths,
  ]);
  return {
    logoUrl: logoPath ? (urls.get(logoPath) ?? null) : null,
    photos: (photoRows ?? []).map((p) => ({
      id: p.id as string,
      url: urls.get(p.storage_path as string) ?? null,
      position: p.position as number,
    })),
  };
}

export async function uploadStudioLogoCore(
  userId: string,
  studioId: string,
  file: File,
): Promise<{ error?: string }> {
  if (!(await ownedStudioId(userId, studioId)))
    return { error: "Not your studio." };
  const invalid = validateUploadFile(file);
  if (invalid) return { error: invalid };

  let processed: Buffer;
  try {
    processed = await guardedSharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return { error: "Could not process that image. Try a different file." };
  }

  const path = studioLogoStoragePath(studioId);
  const { error: uploadErr } = await serviceClient.storage
    .from(STUDIO_MEDIA_BUCKET)
    .upload(path, processed, { contentType: "image/webp", upsert: true });
  if (uploadErr) return { error: "Upload failed. Try again." };

  const { error: dbErr } = await serviceClient
    .from("studio_profiles")
    .update({ logo_path: path, updated_at: new Date().toISOString() })
    .eq("id", studioId);
  if (dbErr) return { error: "Could not save your logo. Try again." };
  return {};
}

export async function uploadStudioPhotoCore(
  userId: string,
  studioId: string,
  file: File,
): Promise<{ error?: string }> {
  if (!(await ownedStudioId(userId, studioId)))
    return { error: "Not your studio." };
  const invalid = validateUploadFile(file);
  if (invalid) return { error: invalid };

  const { count, error: countErr } = await serviceClient
    .from("studio_photos")
    .select("id", { count: "exact", head: true })
    .eq("studio_profile_id", studioId);
  // A failed count must not bypass the cap.
  if (countErr || count === null)
    return { error: "Could not save that photo. Try again." };
  if (count >= MAX_STUDIO_PHOTOS)
    return { error: `A studio can have up to ${MAX_STUDIO_PHOTOS} photos.` };

  // Next position from the current MAX, not the count: count+1 collides with
  // surviving rows after a delete.
  const { data: last } = await serviceClient
    .from("studio_photos")
    .select("position")
    .eq("studio_profile_id", studioId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((last?.position as number | undefined) ?? 0) + 1;

  let processed;
  try {
    processed = await processImage(file);
  } catch {
    return { error: "Could not process that image. Try a different file." };
  }

  // Upload first, insert the metadata row second, clean up the object if the
  // insert fails: the DB rows are the source of truth for what exists.
  const photoId = randomUUID();
  const path = studioPhotoStoragePath(studioId, photoId);
  const { error: uploadErr } = await serviceClient.storage
    .from(STUDIO_MEDIA_BUCKET)
    .upload(path, processed.buffer, {
      contentType: processed.mimeType,
      upsert: false,
    });
  if (uploadErr) return { error: "Upload failed. Try again." };

  const { error: dbErr } = await serviceClient.from("studio_photos").insert({
    id: photoId,
    studio_profile_id: studioId,
    storage_path: path,
    position: nextPosition,
    width: processed.width,
    height: processed.height,
    file_size: processed.fileSize,
    mime_type: processed.mimeType,
  });
  if (dbErr) {
    await serviceClient.storage.from(STUDIO_MEDIA_BUCKET).remove([path]);
    return { error: "Could not save that photo. Try again." };
  }
  return {};
}

export async function deleteStudioPhotoCore(
  userId: string,
  studioId: string,
  photoId: string,
): Promise<{ error?: string }> {
  if (!(await ownedStudioId(userId, studioId)))
    return { error: "Not your studio." };

  const { data: photo } = await serviceClient
    .from("studio_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("studio_profile_id", studioId)
    .maybeSingle();
  if (!photo) return { error: "That photo is already gone." };

  // Delete the row first (source of truth), then the object; a failed object
  // removal leaves a sweepable orphan, never a ghost row.
  const { error: dbErr } = await serviceClient
    .from("studio_photos")
    .delete()
    .eq("id", photoId);
  if (dbErr) return { error: "Could not delete that photo. Try again." };
  const path = photo.storage_path as string;
  if (isOwnedStudioMediaPath(studioId, path)) {
    await serviceClient.storage.from(STUDIO_MEDIA_BUCKET).remove([path]);
  }
  return {};
}

export async function setPublicationCore(
  userId: string,
  studioId: string,
  publish: boolean,
): Promise<{ error?: string }> {
  const studio = await getOwnedStudio(userId);
  if (!studio || studio.id !== studioId) return { error: "Not your studio." };

  if (publish) {
    if (!studio.completeness.publishReady)
      return {
        error: `Still to do before publishing: ${studio.completeness.publishBlockers.join(", ")}.`,
      };
    if (studio.categories.length < MIN_STUDIO_CATEGORIES)
      return { error: "Choose at least 3 categories before publishing." };
  }

  const { error } = await serviceClient
    .from("studio_profiles")
    .update({
      publication_status: publish ? "published" : "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", studioId)
    .eq("owner_user_id", userId);
  if (error) return { error: "Could not update your studio." };
  return {};
}

// ---------------------------------------------------------------------------
// Studio claims (Phase 3 claim flow + claim conflict, migration 0079).
// A claim is a moderation-queue item: submitted through the rate-limited
// action here, decided in admin. Ownership NEVER changes while a location is
// contested; approval is the only transition that assigns an owner, and it
// rejects the sibling claims in the same action.

export type ClaimInput = {
  claimantRole: string;
  socialLink: string;
  addressConfirmation: string;
  evidenceNote: string | null;
};

export type OwnClaim = {
  id: string;
  locationName: string;
  locationCity: string | null;
  status: string;
  createdAt: string;
};

export async function submitClaimCore(
  userId: string,
  mapLocationId: string,
  input: ClaimInput,
): Promise<{ error?: string }> {
  if (!CLAIMANT_ROLES.includes(input.claimantRole as ClaimantRole))
    return { error: "Pick your role at the studio." };
  if (input.socialLink.length > CLAIM_SOCIAL_LINK_MAX)
    return { error: "That link is too long." };
  const sanitized = sanitizeBioLinkUrl(input.socialLink);
  const social =
    sanitized && /^https?:\/\//i.test(sanitized) ? sanitized : null;
  if (!social)
    return { error: "Add a social media link so we can see it is really you." };
  if (!input.addressConfirmation?.trim())
    return { error: "Confirm the studio address." };
  if (input.addressConfirmation.length > CLAIM_ADDRESS_MAX)
    return {
      error: `Address confirmation must be at most ${CLAIM_ADDRESS_MAX} characters.`,
    };
  if ((input.evidenceNote ?? "").length > CLAIM_EVIDENCE_MAX)
    return {
      error: `The note must be at most ${CLAIM_EVIDENCE_MAX} characters.`,
    };

  // One studio per owner: an existing owner cannot claim a second one.
  const { data: ownedStudio } = await serviceClient
    .from("studio_profiles")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (ownedStudio) return { error: "You already run a studio." };

  const { data: location } = await serviceClient
    .from("map_locations")
    .select("id, claim_status, moderation_status, category")
    .eq("id", mapLocationId)
    .maybeSingle();
  // Mirror the artist-facing gates exactly (the map and claim pages are
  // approved-only, and shops are not claimable studios), so a direct action
  // call cannot claim what the UI never offers.
  if (
    !location ||
    location.moderation_status !== "approved" ||
    location.category === "supply_shop"
  )
    return { error: "This place is not on the map." };
  if (location.claim_status === "claimed")
    return { error: "This studio is already claimed." };

  const { allowed } = await checkClaimRateLimit(userId);
  if (!allowed) return { error: "Too many claims today. Try again tomorrow." };

  const { error: insertErr } = await serviceClient
    .from("location_claims")
    .insert({
      map_location_id: mapLocationId,
      claimant_user_id: userId,
      claimant_role: input.claimantRole,
      social_link: social,
      address_confirmation: input.addressConfirmation.trim(),
      evidence_note: input.evidenceNote?.trim() || null,
    });
  if (insertErr) {
    if (insertErr.code === "23505")
      return { error: "You already have a claim waiting for this studio." };
    return { error: "Could not submit your claim. Try again." };
  }

  // Location state: first pending claim marks it claim_pending; a second
  // claimant marks the location contested. Ownership stays frozen either way.
  // Known benign race: two simultaneous submits can briefly settle on
  // claim_pending despite two pending rows; only the directory badge is
  // affected (the admin queue derives contested from claim_conflict AND the
  // actual rows), and any later transition re-settles it.
  const { count: pendingCount } = await serviceClient
    .from("location_claims")
    .select("id", { count: "exact", head: true })
    .eq("map_location_id", mapLocationId)
    .eq("status", "pending");
  await serviceClient
    .from("map_locations")
    .update({
      claim_status:
        (pendingCount ?? 1) >= 2 ? "claim_conflict" : "claim_pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", mapLocationId)
    .neq("claim_status", "claimed");
  return {};
}

/** The cockpit view of the caller's own claims. */
export async function getOwnClaims(userId: string): Promise<OwnClaim[]> {
  const { data: claims } = await serviceClient
    .from("location_claims")
    .select("id, map_location_id, status, created_at")
    .eq("claimant_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (!claims?.length) return [];
  const locationIds = [
    ...new Set(claims.map((c) => c.map_location_id as string)),
  ];
  const { data: locations } = await serviceClient
    .from("map_locations")
    .select("id, name, city")
    .in("id", locationIds);
  const byId = new Map(
    (locations ?? []).map((l) => [
      l.id as string,
      { name: l.name as string, city: (l.city as string | null) ?? null },
    ]),
  );
  return claims.map((c) => {
    const loc = byId.get(c.map_location_id as string);
    return {
      id: c.id as string,
      locationName: loc?.name ?? "Removed entry",
      locationCity: loc?.city ?? null,
      status: c.status as string,
      createdAt: c.created_at as string,
    };
  });
}

/**
 * Admin approval: the claimant becomes the studio owner. Ordering is
 * compensated so a partial failure is always retryable: (1) create the
 * studio (the unique owner constraint catches doubles), (2) link + mark the
 * location claimed (failure deletes the studio), (3) approve the claim,
 * (4) reject sibling pending claims. A retry after (2) detects the existing
 * claimant-owned studio linked to this location and finishes (3) and (4).
 */
export async function approveClaimCore(
  claimId: string,
  reviewerId: string,
): Promise<{ error?: string }> {
  const { data: claim } = await serviceClient
    .from("location_claims")
    .select("id, map_location_id, claimant_user_id, social_link, status")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) return { error: "Claim not found." };
  if (claim.status !== "pending")
    return { error: "This claim was already decided." };

  const locationId = claim.map_location_id as string;
  const claimantId = claim.claimant_user_id as string;
  const { data: location } = await serviceClient
    .from("map_locations")
    .select(
      "id, name, address, city, country, postal_code, claim_status, studio_profile_id",
    )
    .eq("id", locationId)
    .maybeSingle();
  if (!location) return { error: "This location no longer exists." };

  const { data: claimantStudio } = await serviceClient
    .from("studio_profiles")
    .select("id")
    .eq("owner_user_id", claimantId)
    .maybeSingle();

  let studioId: string;
  if (claimantStudio) {
    // Retry path only: the claimant's studio must be the one already linked
    // to THIS location; anything else means they own a different studio.
    if (location.studio_profile_id !== claimantStudio.id)
      return { error: "The claimant already runs a studio." };
    studioId = claimantStudio.id as string;
  } else {
    if (location.claim_status === "claimed")
      return { error: "This location is already claimed." };
    const { data: studio, error: studioErr } = await serviceClient
      .from("studio_profiles")
      .insert({
        owner_user_id: claimantId,
        name: location.name as string,
        address: (location.address as string | null) ?? null,
        city: (location.city as string | null) ?? null,
        country: (location.country as string | null) ?? null,
        postal_code: (location.postal_code as string | null) ?? null,
        settings: { social_links: [claim.social_link] },
      })
      .select("id")
      .single();
    if (studioErr || !studio)
      return { error: "Could not set up the claimant studio. Try again." };
    studioId = studio.id as string;

    // Conditional + verified: a concurrent approval of a sibling claim loses
    // this race cleanly instead of double-claiming the location.
    const { data: linked, error: linkErr } = await serviceClient
      .from("map_locations")
      .update({
        studio_profile_id: studioId,
        claim_status: "claimed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", locationId)
      .neq("claim_status", "claimed")
      .select("id");
    if (linkErr || !linked?.length) {
      await serviceClient.from("studio_profiles").delete().eq("id", studioId);
      return {
        error: linkErr
          ? "Could not link the studio. Try again."
          : "This location is already claimed.",
      };
    }
  }

  const now = new Date().toISOString();
  const { error: approveErr } = await serviceClient
    .from("location_claims")
    .update({ status: "approved", reviewed_by: reviewerId, reviewed_at: now })
    .eq("id", claimId);
  if (approveErr) return { error: "Could not record the approval. Retry." };
  const { error: siblingErr } = await serviceClient
    .from("location_claims")
    .update({ status: "rejected", reviewed_by: reviewerId, reviewed_at: now })
    .eq("map_location_id", locationId)
    .eq("status", "pending");
  if (siblingErr)
    return {
      error:
        "Approved, but the other claims on this location could not be auto-rejected. Reject them from the queue.",
    };
  return {};
}

export async function rejectClaimCore(
  claimId: string,
  reviewerId: string,
): Promise<{ error?: string }> {
  const { data: claim } = await serviceClient
    .from("location_claims")
    .select("id, map_location_id, claimant_user_id, status")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) return { error: "Claim not found." };
  if (claim.status !== "pending")
    return { error: "This claim was already decided." };

  // Guard against rejecting a HALF-APPROVED claim (approveClaimCore failed
  // after the studio was created and linked): rejecting here would record a
  // denial while the claimant silently keeps ownership. Finish with Approve.
  const [{ data: claimantStudio }, { data: claimLocation }] = await Promise.all(
    [
      serviceClient
        .from("studio_profiles")
        .select("id")
        .eq("owner_user_id", claim.claimant_user_id as string)
        .maybeSingle(),
      serviceClient
        .from("map_locations")
        .select("studio_profile_id")
        .eq("id", claim.map_location_id as string)
        .maybeSingle(),
    ],
  );
  if (claimantStudio && claimLocation?.studio_profile_id === claimantStudio.id)
    return {
      error:
        "This claim is half approved (the claimant already owns the linked studio). Use approve to finish it.",
    };

  const { error } = await serviceClient
    .from("location_claims")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", claimId);
  if (error) return { error: "Could not record the rejection. Retry." };

  // Settle the location state from the remaining pending claims.
  const locationId = claim.map_location_id as string;
  const { count } = await serviceClient
    .from("location_claims")
    .select("id", { count: "exact", head: true })
    .eq("map_location_id", locationId)
    .eq("status", "pending");
  const remaining = count ?? 0;
  await serviceClient
    .from("map_locations")
    .update({
      claim_status:
        remaining >= 2
          ? "claim_conflict"
          : remaining === 1
            ? "claim_pending"
            : "unclaimed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", locationId)
    .neq("claim_status", "claimed");
  return {};
}
