import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsBundlesAllowed } from "@/lib/server/entitlement-gates";
import {
  listBundlesForArtist,
  saveBundleCore,
  deleteBundleCore,
  setBundleArchivedCore,
  reorderBundlesCore,
  setBundleItemsCore,
  type BundleWriteResult,
} from "@/lib/server/bundles";
import { toPriceNumber } from "@inklee/shared/goods";
import type { MobileBundleList } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET / POST / PATCH / DELETE /api/mobile/goods/bundles — the native twin of
// /goods/bundles. Every write goes through the SAME cores the web actions use,
// so the entitlement refusal, archive-first delete and item cap cannot drift
// between the two surfaces.

/** One mapping for every write result. 403 for the entitlement (the app maps it
 *  to IAP-safe copy), 409 for an eligibility refusal (a state conflict: a live
 *  bundle must be archived before delete), 500 for a failure, 400 otherwise. */
function writeResponse(result: BundleWriteResult) {
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

  const [bundles, { data: rawProducts }] = await Promise.all([
    listBundlesForArtist(supabase, userId),
    supabase
      .from("products")
      .select(
        "id, title, price_amount, product_variants(id, name, price_amount_override, status, sort_order)",
      )
      .eq("artist_id", userId)
      .neq("status", "archived")
      .order("sort_order", { ascending: true }),
  ]);

  let entitled = false;
  try {
    entitled = goodsBundlesAllowed(await getAccountOverrides(userId));
  } catch {
    entitled = false;
  }

  const body: MobileBundleList = {
    entitled,
    bundles: bundles.map((b) => ({
      id: b.id,
      name: b.name,
      priceAmount: b.priceAmount,
      currency: b.currency,
      position: b.position,
      isPublicVisible: b.isPublicVisible,
      archivedAt: b.archivedAt ?? null,
      items: b.items.map((it) => ({
        productId: it.productId,
        variantId: it.variantId,
        quantity: it.quantity,
        position: it.position,
      })),
    })),
    products: (rawProducts ?? []).map((p) => ({
      id: p.id as string,
      title: p.title as string,
      priceAmount: toPriceNumber(p.price_amount),
      variants: (
        (p.product_variants ?? []) as {
          id: string;
          name: string;
          price_amount_override: number | null;
          status: string;
          sort_order: number;
        }[]
      )
        .filter((v) => v.status === "active")
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((v) => ({
          id: v.id,
          name: v.name,
          priceAmount:
            v.price_amount_override === null
              ? null
              : toPriceNumber(v.price_amount_override),
        })),
    })),
  };
  return mobileOk(body);
}

/** Create or edit a bundle. SPARSE: a key the client omits is left alone. */
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

  const input: {
    name?: unknown;
    priceAmount?: unknown;
    isPublicVisible?: unknown;
  } = {};
  if ("name" in b) input.name = b.name;
  if ("priceAmount" in b) input.priceAmount = b.priceAmount;
  if ("isPublicVisible" in b) input.isPublicVisible = b.isPublicVisible;

  return writeResponse(
    await saveBundleCore(
      supabase,
      userId,
      input,
      typeof b.id === "string" ? b.id : undefined,
    ),
  );
}

/**
 * State-changing operations, discriminated by `op`. Unknown ops are refused so
 * a newer app calling an older deployment gets a clear 400, not a silent no-op.
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
        await setBundleArchivedCore(supabase, userId, str(b.id), b.archived),
      );

    case "reorder":
      return writeResponse(
        await reorderBundlesCore(supabase, userId, ids(b.orderedIds)),
      );

    case "setItems": {
      if (!str(b.bundleId)) return mobileError(400, "Missing bundle id.");
      // Each item is { productId, quantity, variantId? }; anything malformed
      // is filtered so the core receives a clean list (it de-dupes and caps
      // as well). variantId (FD6) is the artist's fixed choice for this
      // slot; omitted or non-string collapses to null ("no variant").
      const rawItems = Array.isArray(b.items) ? b.items : [];
      const items = rawItems
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          const productId = typeof o.productId === "string" ? o.productId : "";
          const quantity =
            typeof o.quantity === "number" && o.quantity > 0
              ? Math.floor(o.quantity)
              : 1;
          const variantId =
            typeof o.variantId === "string" ? o.variantId : null;
          return productId ? { productId, quantity, variantId } : null;
        })
        .filter(
          (
            x,
          ): x is {
            productId: string;
            quantity: number;
            variantId: string | null;
          } => x !== null,
        );
      return writeResponse(
        await setBundleItemsCore(supabase, userId, str(b.bundleId), items),
      );
    }

    default:
      return mobileError(400, "Unknown operation.");
  }
}

export async function DELETE(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return mobileError(400, "Missing bundle id.");

  // Returns 409 with `not_eligible` when the bundle is still live; the app shows
  // the core's message, which names archiving as the way out.
  return writeResponse(await deleteBundleCore(supabase, userId, id));
}
