import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeBundleName,
  validateBundleName,
  MAX_BUNDLE_ITEMS,
  type Bundle,
  type BundleItem,
} from "@inklee/shared/bundles";
import { parsePriceInput, toPriceNumber } from "@inklee/shared/goods";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsBundlesAllowed } from "./entitlement-gates";

// The ONE write path for product bundles (Plus build, Stage 3), shared by the
// web action and the mobile routes, same discipline as collections.ts: the
// entitlement is refused server-side, never merely hidden in the UI.
//
// A bundle is collections' shape plus a price. Membership + ordering live in
// `product_bundle_items` (migration 0132). Delete requires archive-first (B4:
// no empty-delete fast path, so the #19 TOCTOU cascade race cannot exist here).
// The PAYABLE checkout (turning a bundle into order_items) is a separate slice.

export type BundleWriteResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      code: "not_entitled" | "invalid" | "not_eligible" | "failed";
    };

async function requireEntitlement(
  artistId: string,
): Promise<BundleWriteResult | null> {
  try {
    if (!goodsBundlesAllowed(await getAccountOverrides(artistId))) {
      return {
        ok: false,
        code: "not_entitled",
        error: "Bundles aren't included in your current plan.",
      };
    }
  } catch {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't verify your plan. Please try again.",
    };
  }
  return null;
}

/** Next free slot at the end of the artist's live list. Read-then-write, so two
 *  simultaneous creates can tie on a number; a cosmetic tie in a hand-sorted
 *  list, fixed by any reorder (same trade collections make). */
async function nextBundlePosition(
  supabase: SupabaseClient,
  artistId: string,
): Promise<number> {
  const { data } = await supabase
    .from("product_bundles")
    .select("position")
    .eq("artist_id", artistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const top = (data?.position as number | undefined) ?? -1;
  return top + 1;
}

export async function saveBundleCore(
  supabase: SupabaseClient,
  artistId: string,
  input: { name?: unknown; priceAmount?: unknown; isPublicVisible?: unknown },
  existingId?: string,
): Promise<BundleWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  // Sparse on update: only keys actually present are written, so toggling
  // visibility never resets the name or price (the collections lesson).
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const wantsName = input.name !== undefined;
  if (wantsName || !existingId) {
    const name = normalizeBundleName(input.name);
    const nameError = validateBundleName(name);
    if (nameError) return { ok: false, code: "invalid", error: nameError };
    row.name = name;
  }

  const wantsPrice = input.priceAmount !== undefined;
  if (wantsPrice || !existingId) {
    const parsed = parsePriceInput(
      typeof input.priceAmount === "number"
        ? String(input.priceAmount)
        : (input.priceAmount as string | null | undefined),
    );
    if ("error" in parsed) {
      return { ok: false, code: "invalid", error: parsed.error };
    }
    row.price_amount = parsed.value;
  }

  if (input.isPublicVisible !== undefined) {
    row.is_public_visible = input.isPublicVisible !== false;
  } else if (!existingId) {
    row.is_public_visible = true;
  }

  if (!existingId) {
    row.artist_id = artistId;
    row.position = await nextBundlePosition(supabase, artistId);
  }

  const { data, error } = existingId
    ? await supabase
        .from("product_bundles")
        .update(row)
        .eq("id", existingId)
        .eq("artist_id", artistId)
        .select("id")
        .maybeSingle()
    : await supabase.from("product_bundles").insert(row).select("id").single();

  if (error) return { ok: false, code: "failed", error: "Couldn't save." };
  if (!data)
    return { ok: false, code: "failed", error: "That bundle is gone." };
  return { ok: true, id: data.id as string };
}

/** Reorder the artist's bundles. Positions are rewritten to the given order, so
 *  ties/gaps normalise on any drag. RLS filters ids the artist does not own. */
export async function reorderBundlesCore(
  supabase: SupabaseClient,
  artistId: string,
  orderedIds: string[],
): Promise<BundleWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;
  if (orderedIds.length === 0) {
    return { ok: false, code: "invalid", error: "Nothing to reorder." };
  }
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error } = await supabase
      .from("product_bundles")
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq("id", orderedIds[i])
      .eq("artist_id", artistId);
    if (error) return { ok: false, code: "failed", error: "Couldn't reorder." };
  }
  return { ok: true, id: orderedIds[0] };
}

/** Archive or restore a bundle. Archiving keeps items intact, so a restore
 *  brings the offer back whole; it is also the precondition for delete (B4). */
export async function setBundleArchivedCore(
  supabase: SupabaseClient,
  artistId: string,
  id: string,
  archived: boolean,
): Promise<BundleWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const { data, error } = await supabase
    .from("product_bundles")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("artist_id", artistId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: "failed", error: "Couldn't save." };
  if (!data)
    return { ok: false, code: "failed", error: "That bundle is gone." };
  return { ok: true, id: data.id as string };
}

/**
 * Delete a bundle. ARCHIVE-FIRST (B4): a live bundle is refused with
 * `not_eligible`, and only an archived bundle is deleted. Gating on the stable
 * `archived_at` column (not on emptiness) means there is no non-atomic
 * `where not exists(items)` to race, so the #19 cascade defect cannot occur.
 * The item rows cascade with the parent, which is correct once archived.
 */
export async function deleteBundleCore(
  supabase: SupabaseClient,
  artistId: string,
  id: string,
): Promise<BundleWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const { data, error } = await supabase
    .from("product_bundles")
    .delete()
    .eq("id", id)
    .eq("artist_id", artistId)
    .not("archived_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: "failed", error: "Couldn't delete." };
  if (data) return { ok: true, id: data.id as string };

  // Nothing deleted: either the bundle is gone, or it is still live. Distinguish
  // so the artist gets the actionable message rather than a generic failure.
  const { data: exists } = await supabase
    .from("product_bundles")
    .select("archived_at")
    .eq("id", id)
    .eq("artist_id", artistId)
    .maybeSingle();
  if (exists && !exists.archived_at) {
    return {
      ok: false,
      code: "not_eligible",
      error: "Archive this bundle first, then you can delete it.",
    };
  }
  return { ok: false, code: "failed", error: "That bundle is gone." };
}

/** Match a nullable variant_id filter. `.eq(col, null)` is NOT the same
 *  PostgREST predicate as `.is(col, null)` (0138's own lesson, applied here):
 *  a variant-scoped lookup needs the right one depending on whether a variant
 *  was actually declared for this slot.
 *
 *  T is left UNCONSTRAINED and the call is routed through a local, non-
 *  recursive shape on purpose: a constraint like `T extends { eq: (...) =>
 *  T }` asks TypeScript to structurally verify that Supabase's own (already
 *  deeply generic) filter-builder type satisfies "returns itself", which
 *  blows up with "Type instantiation is excessively deep and possibly
 *  infinite" (TS2589) against the real builder type. The cast is safe: every
 *  Supabase query-builder stage exposes both `.eq()` and `.is()` returning a
 *  builder of the same shape (that is what makes `.eq(...).eq(...)`
 *  chainable at all), so this reflects only what the two call sites below
 *  already relied on. */
function byVariant<T>(query: T, variantId: string | null): T {
  const filterable = query as unknown as {
    eq: (c: string, v: unknown) => unknown;
    is: (c: string, v: unknown) => unknown;
  };
  return (
    variantId === null
      ? filterable.is("variant_id", null)
      : filterable.eq("variant_id", variantId)
  ) as T;
}

/** Add a product to a bundle (idempotent per (product, variant): a repeat is
 *  a no-op). Quantity defaults to 1; a caller may pass more. `variantId` is
 *  the artist's fixed choice for this slot (FD6); the RLS WITH CHECK (0138)
 *  verifies it belongs to `productId` and refuses the write otherwise — this
 *  function surfaces that as the generic `invalid` result, same as any other
 *  insert failure. NOTE: the editor's actual write path is
 *  `setBundleItemsCore` below (a full-list replace); this lower-level pair
 *  exists for the entitlement-gate battery and any future singular caller. */
export async function addProductToBundleCore(
  supabase: SupabaseClient,
  artistId: string,
  bundleId: string,
  productId: string,
  quantity = 1,
  variantId: string | null = null,
): Promise<BundleWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const qty =
    Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;

  const { data: existing } = await byVariant(
    supabase
      .from("product_bundle_items")
      .select("id")
      .eq("bundle_id", bundleId)
      .eq("product_id", productId),
    variantId,
  ).maybeSingle();
  if (existing) return { ok: true, id: existing.id as string };

  const { count } = await supabase
    .from("product_bundle_items")
    .select("id", { count: "exact", head: true })
    .eq("bundle_id", bundleId);
  if ((count ?? 0) >= MAX_BUNDLE_ITEMS) {
    return {
      ok: false,
      code: "invalid",
      error: `A bundle can hold at most ${MAX_BUNDLE_ITEMS} products.`,
    };
  }

  const { data: last } = await supabase
    .from("product_bundle_items")
    .select("position")
    .eq("bundle_id", bundleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last?.position as number | undefined) ?? -1) + 1;

  // artist_id is supplied; the composite FKs + RLS WITH CHECK verify it
  // against BOTH parents (and, since 0138, that a non-null variant_id
  // belongs to THIS product), so a foreign bundle, product or variant id
  // cannot produce a row.
  const { data, error } = await supabase
    .from("product_bundle_items")
    .insert({
      bundle_id: bundleId,
      product_id: productId,
      variant_id: variantId,
      artist_id: artistId,
      quantity: qty,
      position,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return {
      ok: false,
      code: "invalid",
      error: "Couldn't add that to the bundle.",
    };
  }
  return { ok: true, id: data.id as string };
}

export async function removeProductFromBundleCore(
  supabase: SupabaseClient,
  artistId: string,
  bundleId: string,
  productId: string,
  variantId: string | null = null,
): Promise<BundleWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const { error } = await byVariant(
    supabase
      .from("product_bundle_items")
      .delete()
      .eq("bundle_id", bundleId)
      .eq("product_id", productId)
      .eq("artist_id", artistId),
    variantId,
  );
  if (error) return { ok: false, code: "failed", error: "Couldn't remove." };
  return { ok: true, id: productId };
}

export type BundleItemInput = {
  productId: string;
  quantity: number;
  /** The artist's fixed variant choice for this slot (FD6). Omitted or null
   *  means "no variant" — valid so long as the product itself has no ACTIVE
   *  variant to choose; otherwise the RLS WITH CHECK (0138) or the shared
   *  purchasability rule flags it as needing one. */
  variantId?: string | null;
};

/** Identity key for a bundle slot: a product now legitimately appears more
 *  than once in one bundle (FD6), once per distinct variant, so identity is
 *  (productId, variantId) together, never productId alone. */
function slotKey(productId: string, variantId: string | null): string {
  return `${productId}::${variantId ?? ""}`;
}

/**
 * Set the FULL item list of a bundle (the editor holds the whole answer).
 * Upserts each wanted (product, variant) slot at its array position with its
 * quantity, and removes any current slot not in the wanted set. Additions
 * past the item cap are refused. Quantities and positions of surviving slots
 * are updated.
 */
export async function setBundleItemsCore(
  supabase: SupabaseClient,
  artistId: string,
  bundleId: string,
  items: BundleItemInput[],
): Promise<BundleWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  // De-dupe by (product, variant) slot (keep first), and cap.
  const seen = new Set<string>();
  const wanted = items
    .map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      variantId: it.variantId ?? null,
    }))
    .filter((it) => {
      if (!it.productId) return false;
      const key = slotKey(it.productId, it.variantId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_BUNDLE_ITEMS);

  // Verify the bundle is owned before touching items (the item RLS also checks,
  // but this returns a clean message rather than a silent zero-row write).
  const { data: bundle } = await supabase
    .from("product_bundles")
    .select("id")
    .eq("id", bundleId)
    .eq("artist_id", artistId)
    .maybeSingle();
  if (!bundle)
    return { ok: false, code: "failed", error: "That bundle is gone." };

  const { data: current, error: readError } = await supabase
    .from("product_bundle_items")
    .select("product_id, variant_id")
    .eq("bundle_id", bundleId)
    .eq("artist_id", artistId);
  if (readError) return { ok: false, code: "failed", error: "Couldn't save." };
  const held = new Map(
    (current ?? []).map((r) => {
      const productId = r.product_id as string;
      const variantId = (r.variant_id as string | null) ?? null;
      return [slotKey(productId, variantId), { productId, variantId }];
    }),
  );
  const wantedKeys = new Set(
    wanted.map((w) => slotKey(w.productId, w.variantId)),
  );

  // Upsert wanted, at array order, with quantity.
  for (let i = 0; i < wanted.length; i += 1) {
    const w = wanted[i];
    const key = slotKey(w.productId, w.variantId);
    const qty =
      Number.isFinite(w.quantity) && w.quantity > 0
        ? Math.floor(w.quantity)
        : 1;
    if (held.has(key)) {
      const { error } = await byVariant(
        supabase
          .from("product_bundle_items")
          .update({ quantity: qty, position: i })
          .eq("bundle_id", bundleId)
          .eq("product_id", w.productId)
          .eq("artist_id", artistId),
        w.variantId,
      );
      if (error) return { ok: false, code: "failed", error: "Couldn't save." };
    } else {
      const { error } = await supabase.from("product_bundle_items").insert({
        bundle_id: bundleId,
        product_id: w.productId,
        variant_id: w.variantId,
        artist_id: artistId,
        quantity: qty,
        position: i,
      });
      if (error) {
        return {
          ok: false,
          code: "invalid",
          error: "Couldn't add a product to the bundle.",
        };
      }
    }
  }
  // Remove held slots no longer wanted.
  for (const [key, h] of held) {
    if (wantedKeys.has(key)) continue;
    const { error } = await byVariant(
      supabase
        .from("product_bundle_items")
        .delete()
        .eq("bundle_id", bundleId)
        .eq("product_id", h.productId)
        .eq("artist_id", artistId),
      h.variantId,
    );
    if (error) return { ok: false, code: "failed", error: "Couldn't save." };
  }
  return { ok: true, id: bundleId };
}

// ---------------------------------------------------------------------------
// Reads.

export type BundleWithItems = Bundle & { items: BundleItem[] };

function rowToBundle(r: Record<string, unknown>): Bundle {
  return {
    id: r.id as string,
    name: r.name as string,
    priceAmount: toPriceNumber(r.price_amount),
    currency: (r.currency as string) ?? "eur",
    position: r.position as number,
    isPublicVisible: r.is_public_visible as boolean,
    archivedAt: (r.archived_at as string | null) ?? null,
  };
}

/**
 * The artist's manager view: every bundle (live + archived) with its items.
 * Fails LOUD (throws), like listCollectionsForArtist: a swallowed error here
 * would show "no bundles" and invite the artist to rebuild ones that exist.
 */
export async function listBundlesForArtist(
  supabase: SupabaseClient,
  artistId: string,
): Promise<BundleWithItems[]> {
  const { data, error } = await supabase
    .from("product_bundles")
    .select(
      "id, name, price_amount, currency, position, is_public_visible, archived_at",
    )
    .eq("artist_id", artistId)
    .order("position", { ascending: true });
  if (error) throw new Error(`Could not load bundles: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("product_bundle_items")
    .select("bundle_id, product_id, variant_id, quantity, position")
    .eq("artist_id", artistId);
  if (itemsError) {
    throw new Error(`Could not load bundle contents: ${itemsError.message}`);
  }

  const byBundle = new Map<string, BundleItem[]>();
  for (const it of items ?? []) {
    const key = it.bundle_id as string;
    const list = byBundle.get(key) ?? [];
    list.push({
      bundleId: key,
      productId: it.product_id as string,
      variantId: (it.variant_id as string | null) ?? null,
      quantity: it.quantity as number,
      position: it.position as number,
    });
    byBundle.set(key, list);
  }
  for (const list of byBundle.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  return rows.map((r) => ({
    ...rowToBundle(r),
    items: byBundle.get(r.id as string) ?? [],
  }));
}

/**
 * The PUBLIC shop's bundles, entitlement- and kill-switch-aware. Returns an
 * empty list when the artist is not entitled or the capability is killed (the
 * flat-shop fallback), and FAILS FLAT on any read error, exactly like
 * publicCollectionsForArtist: a downgrade or a read blip must never take the
 * public shop down, it just shows no bundle offers.
 */
export async function publicBundlesForArtist(
  supabase: SupabaseClient,
  artistId: string,
): Promise<BundleWithItems[]> {
  try {
    if (!goodsBundlesAllowed(await getAccountOverrides(artistId))) return [];
  } catch {
    return [];
  }

  const { data: rawBundles, error: bundlesError } = await supabase
    .from("product_bundles")
    .select(
      "id, name, price_amount, currency, position, is_public_visible, archived_at",
    )
    .eq("artist_id", artistId)
    .eq("is_public_visible", true)
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (bundlesError) return [];
  const bundles = (rawBundles ?? []).map(rowToBundle);
  if (bundles.length === 0) return [];

  const { data: rawItems, error: itemsError } = await supabase
    .from("product_bundle_items")
    .select("bundle_id, product_id, variant_id, quantity, position")
    .eq("artist_id", artistId)
    .in(
      "bundle_id",
      bundles.map((b) => b.id),
    )
    .order("position", { ascending: true });
  if (itemsError) return [];

  const byBundle = new Map<string, BundleItem[]>();
  for (const it of rawItems ?? []) {
    const key = it.bundle_id as string;
    const list = byBundle.get(key) ?? [];
    list.push({
      bundleId: key,
      productId: it.product_id as string,
      variantId: (it.variant_id as string | null) ?? null,
      quantity: it.quantity as number,
      position: it.position as number,
    });
    byBundle.set(key, list);
  }

  return bundles.map((b) => ({ ...b, items: byBundle.get(b.id) ?? [] }));
}
