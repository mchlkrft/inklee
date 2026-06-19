"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { guardedSharp } from "@/lib/image-guard";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import {
  parsePriceInput,
  parseOptionalPriceInput,
  isProductCategory,
  isProductStatus,
  isCurrency,
  toPriceNumber,
  maxProductImages,
  DEFAULT_CURRENCY,
  MAX_PRODUCT_TITLE,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PICKUP_NOTE,
  MAX_VARIANT_NAME,
  MAX_VARIANTS,
  type ProductCategory,
  type ProductStatus,
} from "@/lib/goods";
import {
  reconcileVariants,
  type VariantInput,
} from "@/lib/server/goods-variants";
import { ownedGoodsStoragePath } from "@/lib/server/mobile-goods-server";
import type { ProductFormValues } from "./product-form";
import type { VariantInputRow } from "./product-form-fields";

type State = { error: string } | { success: true } | null;

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

type ProductFields = {
  title: string;
  price: number;
  currency: string;
  category: ProductCategory;
  status: ProductStatus;
  description: string | null;
  pickupNote: string | null;
  quantity: number | null;
  isPublicVisible: boolean;
  isCheckoutAddon: boolean;
};

function parseQuantity(
  raw: string | null,
): { value: number | null } | { error: string } {
  const s = (raw ?? "").trim();
  if (s === "") return { value: null };
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0)
    return { error: "Quantity must be 0 or more." };
  return { value: n };
}

function parseProductFields(
  formData: FormData,
): { value: ProductFields } | { error: string } {
  const title = ((formData.get("title") as string | null) ?? "").trim();
  if (!title) return { error: "Title is required." };
  if (title.length > MAX_PRODUCT_TITLE) {
    return { error: `Title must be ${MAX_PRODUCT_TITLE} characters or fewer.` };
  }

  const priceRes = parsePriceInput(formData.get("price") as string | null);
  if ("error" in priceRes) return priceRes;

  const currencyRaw = formData.get("currency");
  const currency = isCurrency(currencyRaw)
    ? String(currencyRaw).toLowerCase()
    : DEFAULT_CURRENCY;

  const categoryRaw = formData.get("category");
  const category: ProductCategory = isProductCategory(categoryRaw)
    ? categoryRaw
    : "other";

  const statusRaw = formData.get("status");
  const status: ProductStatus = isProductStatus(statusRaw)
    ? statusRaw
    : "active";

  const description =
    ((formData.get("description") as string | null) ?? "")
      .trim()
      .slice(0, MAX_PRODUCT_DESCRIPTION) || null;
  const pickupNote =
    ((formData.get("pickup_note") as string | null) ?? "")
      .trim()
      .slice(0, MAX_PICKUP_NOTE) || null;

  const qtyRes = parseQuantity(formData.get("quantity") as string | null);
  if ("error" in qtyRes) return qtyRes;

  // Publish/draft is an explicit, required choice on the create + edit form —
  // reject an absent value rather than silently defaulting to hidden.
  const visRaw = formData.get("is_public_visible");
  if (visRaw !== "on" && visRaw !== "off") {
    return {
      error: "Choose whether to publish this item or save it as a draft.",
    };
  }

  return {
    value: {
      title,
      price: priceRes.value,
      currency,
      category,
      status,
      description,
      pickupNote,
      quantity: qtyRes.value,
      isPublicVisible: visRaw === "on",
      isCheckoutAddon: formData.get("is_checkout_addon") === "on",
    },
  };
}

function parseVariants(
  raw: FormDataEntryValue | null,
): { value: VariantInput[] } | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { value: [] };
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return { error: "Could not read the variants. Try again." };
  }
  if (!Array.isArray(arr)) return { value: [] };

  const out: VariantInput[] = [];
  for (const item of arr.slice(0, MAX_VARIANTS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name =
      typeof o.name === "string"
        ? o.name.trim().slice(0, MAX_VARIANT_NAME)
        : "";
    if (!name) continue; // skip nameless rows

    // Optional variant id. A non-string / blank id is treated as "new row"
    // (insert). Reconcile validates ownership before any update / delete /
    // hide happens, so an attacker-supplied UUID that doesn't belong to
    // this product cannot punch through.
    const id =
      typeof o.id === "string" && o.id.trim().length > 0 ? o.id.trim() : null;

    const priceRes = parseOptionalPriceInput(
      typeof o.priceOverride === "string" || typeof o.priceOverride === "number"
        ? String(o.priceOverride)
        : "",
    );
    if ("error" in priceRes) {
      return { error: `Variant "${name}": ${priceRes.error.toLowerCase()}` };
    }

    let stock: number | null = null;
    const stockStr =
      o.stock === null || o.stock === undefined ? "" : String(o.stock).trim();
    if (stockStr !== "") {
      const n = Number.parseInt(stockStr, 10);
      if (!Number.isFinite(n) || n < 0) {
        return { error: `Variant "${name}": stock must be 0 or more.` };
      }
      stock = n;
    }

    out.push({ id, name, priceOverride: priceRes.value, stock });
  }
  return { value: out };
}

async function uploadProductImage(
  userId: string,
  productId: string,
  file: File,
): Promise<{ url: string; path: string } | { error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Image must be PNG, JPG, or WebP." };
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { error: "Image must be under 5 MB." };
  }
  // Defense in depth: client compresses + validates first, but a file sharp
  // can't decode must surface as a friendly error, never an unhandled 500.
  let resized: Buffer;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    resized = await guardedSharp(buffer)
      .resize(800, 800, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { error: "Could not process that image. Try a different file." };
  }
  // Per-image slug path so multiple images can coexist under one product. The
  // old single-image layout (${userId}/goods/${productId}.webp) is left in
  // place for legacy rows until migration 0038 backfill is verified clean.
  const slug = crypto.randomUUID();
  const path = `${userId}/goods/${productId}/${slug}.webp`;
  const { error } = await serviceClient.storage
    .from("logos")
    .upload(path, resized, { contentType: "image/webp", upsert: false });
  if (error) return { error: "Image upload failed. Try again." };
  const { data } = serviceClient.storage.from("logos").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// ownedGoodsStoragePath (the SECURITY path-ownership check used before every
// .storage.remove()) is single-sourced in @/lib/server/mobile-goods-server so
// the web action and the mobile image route can't drift (ME-10 D12).

// Shared image-write path for create + update. Reads:
//   • existing_image_urls (JSON string of URLs to keep, in order) — empty on
//     create, populated on edit when the artist keeps existing images.
//   • images (one or more File entries from a multi-input).
// Uploads each new file via uploadProductImage, composes the final array as
// keep ++ uploaded (in posted order), and deletes from storage any URL in
// prevImageUrls that didn't survive. On upload failure, rolls back any
// just-uploaded files this call produced.
async function processProductImages(
  userId: string,
  productId: string,
  formData: FormData,
  maxImages: number,
  prevImageUrls: string[],
): Promise<{ value: string[] } | { error: string }> {
  let rawKeep: string[] = [];
  const raw = formData.get("existing_image_urls");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        rawKeep = parsed.filter(
          (s): s is string => typeof s === "string" && s.length > 0,
        );
      }
    } catch {
      return { error: "Couldn't read the image list. Try again." };
    }
  }
  // SECURITY: a keep-list entry is only honoured if it's already present in
  // this product's current image_urls. Without this, an attacker artist
  // could submit a URL pointing at another artist's storage object and
  // either (a) graft it into their own product (info-leak / hotlink) or
  // (b) trigger a cross-artist delete via the removal-diff path below.
  const prevSet = new Set(prevImageUrls);
  const keep = rawKeep.filter((u) => prevSet.has(u));

  const newFiles = (formData.getAll("images") as File[]).filter(
    (f) => f && f.size > 0,
  );
  if (keep.length + newFiles.length > maxImages) {
    return {
      error: `You can have at most ${maxImages} image${maxImages === 1 ? "" : "s"} for this product.`,
    };
  }

  const uploadedUrls: string[] = [];
  for (const file of newFiles) {
    const up = await uploadProductImage(userId, productId, file);
    if ("error" in up) {
      // Rollback uses ownedGoodsStoragePath so even a freshly-uploaded URL
      // can only resolve to a path under this user/product namespace.
      for (const url of uploadedUrls) {
        const p = ownedGoodsStoragePath(url, userId, productId);
        if (p) {
          await serviceClient.storage
            .from("logos")
            .remove([p])
            .catch(() => undefined);
        }
      }
      return up;
    }
    uploadedUrls.push(up.url);
  }
  const finalUrls = [...keep, ...uploadedUrls];

  // Delete any previous URLs the artist dropped from the keep-list. Paths
  // are re-validated against this artist + product namespace, so a tampered
  // prevImageUrls (if one ever leaked in via another bug) still can't
  // cross-artist delete.
  const removed = prevImageUrls.filter((u) => !finalUrls.includes(u));
  for (const url of removed) {
    const p = ownedGoodsStoragePath(url, userId, productId);
    if (p) {
      await serviceClient.storage
        .from("logos")
        .remove([p])
        .catch(() => undefined);
    }
  }

  return { value: finalUrls };
}

// reconcileVariants moved to @/lib/server/goods-variants — shared with PUT
// /api/mobile/goods/:id/variants so web and app variant writes cannot drift.

async function revalidatePublicPage(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", userId)
    .single();
  if (profile?.slug) revalidatePath(`/${profile.slug}`);
}

export async function createProductAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const parsed = parseProductFields(formData);
  if ("error" in parsed) return parsed;
  const variantsRes = parseVariants(formData.get("variants"));
  if ("error" in variantsRes) return variantsRes;
  const f = parsed.value;

  // New products go to the end of the sort order.
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", user.id);

  const { data: inserted, error } = await supabase
    .from("products")
    .insert({
      artist_id: user.id,
      title: f.title,
      description: f.description,
      category: f.category,
      price_amount: f.price,
      currency: f.currency,
      status: f.status,
      pickup_note: f.pickupNote,
      is_public_visible: f.isPublicVisible,
      is_checkout_addon: f.isCheckoutAddon,
      quantity: f.quantity,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: error?.message ?? "Could not create the product." };
  }
  const productId = inserted.id as string;

  const maxImages = maxProductImages(variantsRes.value.length);
  const imagesResult = await processProductImages(
    user.id,
    productId,
    formData,
    maxImages,
    [],
  );
  if ("error" in imagesResult) return imagesResult;
  const imageUrls = imagesResult.value;
  if (imageUrls.length > 0) {
    await supabase
      .from("products")
      .update({ image_urls: imageUrls, image_url: imageUrls[0] })
      .eq("id", productId);
  }

  await reconcileVariants(productId, variantsRes.value);

  revalidatePath("/goods");
  await revalidatePublicPage(user.id);
  return { success: true };
}

export async function updateProductAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const id = ((formData.get("id") as string | null) ?? "").trim();
  if (!id) return { error: "Missing product id." };

  // Ownership: the RLS-bound select only returns the row if it's the user's.
  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .eq("artist_id", user.id)
    .single();
  if (!existing) return { error: "Product not found." };

  const parsed = parseProductFields(formData);
  if ("error" in parsed) return parsed;
  const variantsRes = parseVariants(formData.get("variants"));
  if ("error" in variantsRes) return variantsRes;
  const f = parsed.value;

  // Fetch the current image list so we can diff against the keep-list and
  // delete dropped images from storage. Falls back to legacy single image_url
  // for rows that haven't been written since migration 0038.
  const { data: prevRow } = await supabase
    .from("products")
    .select("image_urls, image_url")
    .eq("id", id)
    .eq("artist_id", user.id)
    .single();
  const prevImageUrls: string[] = Array.isArray(prevRow?.image_urls)
    ? (prevRow!.image_urls as string[])
    : prevRow?.image_url
      ? [prevRow.image_url as string]
      : [];

  const maxImages = maxProductImages(variantsRes.value.length);
  const imagesResult = await processProductImages(
    user.id,
    id,
    formData,
    maxImages,
    prevImageUrls,
  );
  if ("error" in imagesResult) return imagesResult;
  const imageUrls = imagesResult.value;

  const { error } = await supabase
    .from("products")
    .update({
      title: f.title,
      description: f.description,
      category: f.category,
      price_amount: f.price,
      currency: f.currency,
      status: f.status,
      pickup_note: f.pickupNote,
      is_public_visible: f.isPublicVisible,
      is_checkout_addon: f.isCheckoutAddon,
      quantity: f.quantity,
      image_urls: imageUrls,
      image_url: imageUrls[0] ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  await reconcileVariants(id, variantsRes.value);

  revalidatePath("/goods");
  revalidatePath(`/goods/${id}`);
  await revalidatePublicPage(user.id);
  return { success: true };
}

export async function deleteProductAction(id: string): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Variants cascade via FK. No order_items reference products yet (Slice 75);
  // when they do, guard this with an order check and archive instead of delete.
  //
  // Snapshot the image URLs first so storage cleanup can include every
  // per-image file (multi-image, migration 0038) plus the legacy single-image
  // path for products never re-saved post-0038.
  const { data: imageRow } = await supabase
    .from("products")
    .select("image_urls, image_url")
    .eq("id", id)
    .eq("artist_id", user.id)
    .single();
  const allImageUrls: string[] = Array.isArray(imageRow?.image_urls)
    ? (imageRow!.image_urls as string[])
    : [];
  if (
    imageRow?.image_url &&
    !allImageUrls.includes(imageRow.image_url as string)
  ) {
    allImageUrls.push(imageRow.image_url as string);
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  // SECURITY: re-derive every path through ownedGoodsStoragePath so the
  // delete sweep can only touch this artist's + product's namespace, even
  // if image_urls somehow contains a foreign URL.
  const pathsToRemove = Array.from(
    new Set([
      ...allImageUrls
        .map((u) => ownedGoodsStoragePath(u, user.id, id))
        .filter((p): p is string => !!p),
      `${user.id}/goods/${id}.webp`,
    ]),
  );
  if (pathsToRemove.length > 0) {
    await serviceClient.storage
      .from("logos")
      .remove(pathsToRemove)
      .catch(() => undefined);
  }

  revalidatePath("/goods");
  await revalidatePublicPage(user.id);
  return { success: true };
}

// Loads a product + its variants for the inline edit modal (Slice 73 follow-up:
// editing happens in a modal on /goods, not a subpage). Mirrors the mapping the
// /goods/[id] page does server-side. Ownership is enforced by artist_id.
export async function loadProductForEditAction(
  id: string,
): Promise<
  | { product: ProductFormValues; variants: VariantInputRow[] }
  | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: rawProduct } = await supabase
    .from("products")
    .select(
      "id, title, description, category, image_url, image_urls, price_amount, currency, status, pickup_note, quantity, is_public_visible, is_checkout_addon",
    )
    .eq("id", id)
    .eq("artist_id", user.id)
    .single();
  if (!rawProduct) return { error: "Product not found." };
  const row = rawProduct as unknown as {
    id: string;
    title: string;
    description: string | null;
    category: string;
    image_url: string | null;
    image_urls: string[] | null;
    price_amount: string | number;
    currency: string | null;
    status: string;
    pickup_note: string | null;
    quantity: number | null;
    is_public_visible: boolean;
    is_checkout_addon: boolean;
  };

  // Variant id is included so the edit form can round-trip it and
  // reconcileVariants can update existing rows in place. Hidden variants
  // (soft-archived because they're still referenced by booking_interests /
  // order_items) are excluded — the artist sees the active set; if they
  // re-add a same-named variant it gets a new id, which is fine.
  const { data: rawVariants } = await supabase
    .from("product_variants")
    .select("id, name, price_amount_override, stock_quantity")
    .eq("product_id", id)
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  const product: ProductFormValues = {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    category: (isProductCategory(row.category)
      ? row.category
      : "other") as ProductCategory,
    price: String(toPriceNumber(row.price_amount)),
    currency: typeof row.currency === "string" ? row.currency : "eur",
    status: (isProductStatus(row.status)
      ? row.status
      : "active") as ProductStatus,
    pickupNote: row.pickup_note ?? "",
    quantity:
      row.quantity !== null && row.quantity !== undefined
        ? String(row.quantity)
        : "",
    isPublicVisible: row.is_public_visible,
    isCheckoutAddon: row.is_checkout_addon,
    imageUrl: row.image_url,
    // image_urls is the canonical multi-image source post-migration 0038; fall
    // back to ARRAY[image_url] for rows that haven't been re-saved yet.
    imageUrls: Array.isArray(row.image_urls)
      ? row.image_urls
      : row.image_url
        ? [row.image_url]
        : [],
  };

  const variants: VariantInputRow[] = (
    (rawVariants ?? []) as unknown as {
      id: string;
      name: string;
      price_amount_override: string | number | null;
      stock_quantity: number | null;
    }[]
  ).map((v) => ({
    id: v.id,
    name: v.name,
    priceOverride:
      v.price_amount_override !== null && v.price_amount_override !== undefined
        ? String(toPriceNumber(v.price_amount_override))
        : "",
    stock:
      v.stock_quantity !== null && v.stock_quantity !== undefined
        ? String(v.stock_quantity)
        : "",
  }));

  return { product, variants };
}

// Quick status toggle from the Goods grid tile (Slice 73 follow-up): mark a
// product sold out / active / hidden without opening the editor.
export async function setProductStatusAction(
  id: string,
  status: ProductStatus,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  if (!isProductStatus(status)) return { error: "Invalid status." };

  const { error } = await supabase
    .from("products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/goods");
  await revalidatePublicPage(user.id);
  return { success: true };
}
