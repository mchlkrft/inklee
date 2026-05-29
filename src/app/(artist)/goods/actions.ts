"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import {
  parsePriceInput,
  parseOptionalPriceInput,
  isProductCategory,
  isProductStatus,
  isCurrency,
  toPriceNumber,
  DEFAULT_CURRENCY,
  MAX_PRODUCT_TITLE,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PICKUP_NOTE,
  MAX_VARIANT_NAME,
  type ProductCategory,
  type ProductStatus,
} from "@/lib/goods";
import type { ProductFormValues } from "./product-form";
import type { VariantInputRow } from "./product-form-fields";

type State = { error: string } | { success: true } | null;

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VARIANTS = 20;

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

type VariantInput = {
  name: string;
  priceOverride: number | null;
  stock: number | null;
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

    out.push({ name, priceOverride: priceRes.value, stock });
  }
  return { value: out };
}

async function uploadProductImage(
  userId: string,
  productId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Image must be PNG, JPG, or WebP." };
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { error: "Image must be under 5 MB." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const resized = await sharp(buffer)
    .resize(800, 800, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toBuffer();
  const path = `${userId}/goods/${productId}.webp`;
  const { error } = await serviceClient.storage
    .from("logos")
    .upload(path, resized, { contentType: "image/webp", upsert: true });
  if (error) return { error: "Image upload failed. Try again." };
  const { data } = serviceClient.storage.from("logos").getPublicUrl(path);
  return { url: `${data.publicUrl}?t=${Date.now()}` };
}

// No order_items reference variants yet (Slice 75). Until then a
// delete-then-insert reconcile is safe and simplest. When order_items FK
// variant_id, switch to a non-destructive upsert keyed on the variant id.
async function replaceVariants(productId: string, variants: VariantInput[]) {
  await serviceClient
    .from("product_variants")
    .delete()
    .eq("product_id", productId);
  if (variants.length === 0) return;
  await serviceClient.from("product_variants").insert(
    variants.map((v, i) => ({
      product_id: productId,
      name: v.name,
      price_amount_override: v.priceOverride,
      stock_quantity: v.stock,
      sort_order: i,
    })),
  );
}

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

  const imageFile = formData.get("image") as File | null;
  if (imageFile && imageFile.size > 0) {
    const up = await uploadProductImage(user.id, productId, imageFile);
    if ("error" in up) return up;
    await supabase
      .from("products")
      .update({ image_url: up.url })
      .eq("id", productId);
  }

  await replaceVariants(productId, variantsRes.value);

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

  let imagePatch: { image_url: string | null } | null = null;
  if (formData.get("remove_image") === "1") {
    await serviceClient.storage
      .from("logos")
      .remove([`${user.id}/goods/${id}.webp`])
      .catch(() => undefined);
    imagePatch = { image_url: null };
  } else {
    const imageFile = formData.get("image") as File | null;
    if (imageFile && imageFile.size > 0) {
      const up = await uploadProductImage(user.id, id, imageFile);
      if ("error" in up) return up;
      imagePatch = { image_url: up.url };
    }
  }

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
      ...(imagePatch ?? {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  await replaceVariants(id, variantsRes.value);

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
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  await serviceClient.storage
    .from("logos")
    .remove([`${user.id}/goods/${id}.webp`])
    .catch(() => undefined);

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
      "id, title, description, category, image_url, price_amount, currency, status, pickup_note, quantity, is_public_visible, is_checkout_addon",
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
    price_amount: string | number;
    currency: string | null;
    status: string;
    pickup_note: string | null;
    quantity: number | null;
    is_public_visible: boolean;
    is_checkout_addon: boolean;
  };

  const { data: rawVariants } = await supabase
    .from("product_variants")
    .select("name, price_amount_override, stock_quantity")
    .eq("product_id", id)
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
  };

  const variants: VariantInputRow[] = (
    (rawVariants ?? []) as unknown as {
      name: string;
      price_amount_override: string | number | null;
      stock_quantity: number | null;
    }[]
  ).map((v) => ({
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
