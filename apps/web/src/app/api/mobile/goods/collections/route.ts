import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsCollectionsAllowed } from "@/lib/server/entitlement-gates";
import {
  listCollectionsForArtist,
  saveCollectionCore,
  deleteCollectionCore,
  setCollectionArchivedCore,
  reorderCollectionsCore,
  addProductToCollectionCore,
  removeProductFromCollectionCore,
  reorderCollectionProductsCore,
  type CollectionWriteResult,
} from "@/lib/server/collections";
import type { MobileCollectionList } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET / POST / PATCH / DELETE /api/mobile/goods/collections — the native twin
// of /goods/collections. Every write goes through the SAME cores the web
// actions use, so the entitlement refusal, the delete-eligibility rule and the
// ordering behaviour cannot drift between the two surfaces.

/** One mapping for every write result, so a native caller and the web form
 *  disagree about nothing. 403 for the entitlement so the app maps it to
 *  IAP-safe copy via plan-errors.ts; 409 for an eligibility refusal, which is
 *  a state conflict rather than a malformed request. */
function writeResponse(result: CollectionWriteResult) {
  if (result.ok) return mobileOk({ ok: true, id: result.id });
  const status =
    result.code === "not_entitled"
      ? 403
      : result.code === "not_eligible"
        ? 409
        : result.code === "failed"
          ? 500
          : 400;
  return mobileError(status, result.error, result.code);
}

export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const [collections, { data: rawProducts }, { data: rawItems }] =
    await Promise.all([
      listCollectionsForArtist(supabase, userId),
      supabase
        .from("products")
        .select("id, title")
        .eq("artist_id", userId)
        .neq("status", "archived")
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_collection_items")
        .select("collection_id, product_id, position")
        .eq("artist_id", userId)
        .order("position", { ascending: true }),
    ]);

  let entitled = false;
  try {
    entitled = goodsCollectionsAllowed(await getAccountOverrides(userId));
  } catch {
    entitled = false;
  }

  const body: MobileCollectionList = {
    entitled,
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
      isPublicVisible: c.isPublicVisible,
      archivedAt: c.archivedAt ?? null,
      productCount: c.productCount,
    })),
    products: (rawProducts ?? []).map((p) => ({
      id: p.id as string,
      title: p.title as string,
    })),
    memberships: (rawItems ?? []).map((m) => ({
      collectionId: m.collection_id as string,
      productId: m.product_id as string,
      position: m.position as number,
    })),
  };
  return mobileOk(body);
}

/** Create or rename a collection. SPARSE: a key the client omits is left
 *  alone, so an app that only toggles visibility cannot blank the name. */
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const input: { name?: unknown; isPublicVisible?: unknown } = {};
  if ("name" in b) input.name = b.name;
  if ("isPublicVisible" in b) input.isPublicVisible = b.isPublicVisible;

  return writeResponse(
    await saveCollectionCore(
      supabase,
      userId,
      input,
      typeof b.id === "string" ? b.id : undefined,
    ),
  );
}

/**
 * The state-changing operations, discriminated by `op`.
 *
 * One route rather than five, because they are all "change this artist's
 * arrangement" and each is a single call with no body worth its own endpoint.
 * The op is required and unknown ops are refused, so a newer app calling an
 * older deployment gets a clear 400 instead of a silent no-op.
 */
export async function PATCH(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const ids = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  switch (b.op) {
    case "archive":
      if (!str(b.id) || typeof b.archived !== "boolean") {
        return mobileError(400, "Nothing to update.");
      }
      return writeResponse(
        await setCollectionArchivedCore(
          supabase,
          userId,
          str(b.id),
          b.archived,
        ),
      );

    case "reorder":
      return writeResponse(
        await reorderCollectionsCore(supabase, userId, ids(b.orderedIds)),
      );

    case "addProduct":
      if (!str(b.productId) || !str(b.collectionId)) {
        return mobileError(400, "Nothing to add.");
      }
      return writeResponse(
        await addProductToCollectionCore(
          supabase,
          userId,
          str(b.productId),
          str(b.collectionId),
        ),
      );

    case "removeProduct":
      if (!str(b.productId) || !str(b.collectionId)) {
        return mobileError(400, "Nothing to remove.");
      }
      return writeResponse(
        await removeProductFromCollectionCore(
          supabase,
          userId,
          str(b.productId),
          str(b.collectionId),
        ),
      );

    case "reorderProducts":
      if (!str(b.collectionId)) {
        return mobileError(400, "Nothing to reorder.");
      }
      return writeResponse(
        await reorderCollectionProductsCore(
          supabase,
          userId,
          str(b.collectionId),
          ids(b.orderedProductIds),
        ),
      );

    default:
      return mobileError(400, "Unknown operation.");
  }
}

export async function DELETE(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return mobileError(400, "Missing collection id.");

  // Returns 409 with `not_eligible` when the collection is populated and live.
  // The app shows the core's message, which names archiving as the way out.
  return writeResponse(await deleteCollectionCore(supabase, userId, id));
}
