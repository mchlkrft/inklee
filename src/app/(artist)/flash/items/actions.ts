"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/flash";
import sharp from "sharp";

type State = { error: string } | { success: true; id?: string } | null;

function parseNumeric(v: FormData, key: string): number | null {
  const raw = v.get(key) as string | null;
  if (!raw || raw.trim() === "") return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function parseString(v: FormData, key: string): string | null {
  const raw = v.get(key) as string | null;
  return raw?.trim() || null;
}

async function uploadPreviewImage(
  file: File,
  artistId: string,
  itemId: string,
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > 5 * 1024 * 1024) return null; // 5MB limit

  const buffer = Buffer.from(await file.arrayBuffer());
  const processed = await sharp(buffer)
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const path = `${artistId}/flash/${itemId}.webp`;
  const { error } = await serviceClient.storage
    .from("logos") // reuse logos bucket (public, no auth)
    .upload(path, processed, { contentType: "image/webp", upsert: true });

  if (error) return null;

  const { data } = serviceClient.storage.from("logos").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function createFlashItemAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const title = parseString(formData, "title");
  if (!title) return { error: "title is required" };

  const rawSlug = parseString(formData, "slug") ?? slugify(title);
  const slug = slugify(rawSlug);
  if (!slug) return { error: "invalid slug" };

  const bookingMode = formData.get("booking_mode") as string;
  if (!["unique", "limited", "repeatable"].includes(bookingMode))
    return { error: "invalid booking mode" };

  const maxBookings =
    bookingMode === "limited" ? parseNumeric(formData, "max_bookings") : null;
  if (bookingMode === "limited" && (!maxBookings || maxBookings < 1))
    return { error: "max bookings must be at least 1 for limited mode" };

  const priceType = formData.get("price_type") as string;
  if (!["fixed", "from", "request"].includes(priceType))
    return { error: "invalid price type" };

  const itemId = crypto.randomUUID();

  // Handle preview image upload
  const imageFile = formData.get("preview_image") as File | null;
  let previewImageUrl = parseString(formData, "preview_image_url");
  if (imageFile && imageFile.size > 0) {
    const uploaded = await uploadPreviewImage(imageFile, user.id, itemId);
    if (uploaded) previewImageUrl = uploaded;
  }

  const { error } = await supabase.from("flash_items").insert({
    id: itemId,
    artist_id: user.id,
    title,
    slug,
    status: formData.get("status") === "published" ? "published" : "draft",
    instagram_post_url: parseString(formData, "instagram_post_url"),
    preview_image_url: previewImageUrl,
    short_description: parseString(formData, "short_description"),
    price_type: priceType,
    price: priceType !== "request" ? parseNumeric(formData, "price") : null,
    size_info: parseString(formData, "size_info"),
    placement_notes: parseString(formData, "placement_notes"),
    booking_mode: bookingMode,
    max_bookings: maxBookings,
    is_bookable: formData.get("is_bookable") !== "false",
    available_from: parseString(formData, "available_from"),
    available_until: parseString(formData, "available_until"),
    flash_day_id: parseString(formData, "flash_day_id"),
  });

  if (error) {
    if (error.message.includes("unique"))
      return { error: "a flash item with this slug already exists" };
    return { error: error.message };
  }

  revalidatePath("/flash/items");
  return { success: true, id: itemId };
}

export async function updateFlashItemAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const id = formData.get("id") as string;
  if (!id) return { error: "missing id" };

  // Ownership check
  const { data: existing } = await supabase
    .from("flash_items")
    .select("id, preview_image_url")
    .eq("id", id)
    .eq("artist_id", user.id)
    .single();
  if (!existing) return { error: "not found" };

  const title = parseString(formData, "title");
  if (!title) return { error: "title is required" };

  const rawSlug = parseString(formData, "slug") ?? slugify(title);
  const slug = slugify(rawSlug);
  if (!slug) return { error: "invalid slug" };

  const bookingMode = formData.get("booking_mode") as string;
  if (!["unique", "limited", "repeatable"].includes(bookingMode))
    return { error: "invalid booking mode" };

  const maxBookings =
    bookingMode === "limited" ? parseNumeric(formData, "max_bookings") : null;
  if (bookingMode === "limited" && (!maxBookings || maxBookings < 1))
    return { error: "max bookings must be at least 1 for limited mode" };

  const priceType = formData.get("price_type") as string;

  // Handle preview image upload
  const imageFile = formData.get("preview_image") as File | null;
  let previewImageUrl =
    parseString(formData, "preview_image_url") ?? existing.preview_image_url;
  if (imageFile && imageFile.size > 0) {
    const uploaded = await uploadPreviewImage(imageFile, user.id, id);
    if (uploaded) previewImageUrl = uploaded;
  }

  const { error } = await supabase
    .from("flash_items")
    .update({
      title,
      slug,
      status: formData.get("status") as string,
      instagram_post_url: parseString(formData, "instagram_post_url"),
      preview_image_url: previewImageUrl,
      short_description: parseString(formData, "short_description"),
      price_type: priceType,
      price: priceType !== "request" ? parseNumeric(formData, "price") : null,
      size_info: parseString(formData, "size_info"),
      placement_notes: parseString(formData, "placement_notes"),
      booking_mode: bookingMode,
      max_bookings: maxBookings,
      is_bookable: formData.get("is_bookable") !== "false",
      available_from: parseString(formData, "available_from"),
      available_until: parseString(formData, "available_until"),
      flash_day_id: parseString(formData, "flash_day_id"),
    })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) {
    if (error.message.includes("unique"))
      return { error: "a flash item with this slug already exists" };
    return { error: error.message };
  }

  revalidatePath("/flash/items");
  revalidatePath(`/flash/items/${id}`);
  return { success: true };
}

export async function archiveFlashItemAction(id: string): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("flash_items")
    .update({ status: "archived", is_bookable: false })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/flash/items");
  return { success: true };
}

export async function toggleFlashBookableAction(
  id: string,
  bookable: boolean,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("flash_items")
    .update({ is_bookable: bookable })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/flash/items");
  return { success: true };
}
