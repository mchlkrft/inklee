"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import sharp from "sharp";
import { writeAudit } from "@/lib/audit";

type State = { error: string } | { success: true } | null;

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_COVER_SIZE = 5 * 1024 * 1024; // 5MB

const COVER_COLOR_NAMES = new Set([
  "mustard",
  "rosa",
  "cobalt",
  "red",
  "green",
]);

function sanitizeCoverColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (COVER_COLOR_NAMES.has(v)) return v;
  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;
  return null;
}

export async function updateProfileAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const displayName = (formData.get("display_name") as string).trim();
  const instagramHandle = (formData.get("instagram_handle") as string | null)
    ?.trim()
    .replace(/^@/, "");
  const bio = (formData.get("bio") as string | null)?.trim();
  const timezone = formData.get("timezone") as string;
  const location = (formData.get("location") as string | null)?.trim();
  const bookingMode = formData.get("booking_mode") as
    | "preferred_date"
    | "fixed_slots"
    | null;
  const logoFile = formData.get("logo") as File | null;
  const coverFile = formData.get("cover_image") as File | null;
  const removeCoverImage = formData.get("remove_cover_image") === "1";
  const coverColorRaw = formData.get("cover_color") as string | null;

  if (!displayName) return { error: "Display name is required." };
  if (bio && bio.length > 280)
    return { error: "Bio must be 280 characters or fewer." };

  let logoUrl: string | undefined;

  if (logoFile && logoFile.size > 0) {
    if (!ALLOWED_TYPES.includes(logoFile.type)) {
      return { error: "Logo must be PNG, JPG, or WebP." };
    }
    if (logoFile.size > MAX_SIZE) {
      return { error: "Logo must be under 2 MB." };
    }

    const buffer = Buffer.from(await logoFile.arrayBuffer());
    const resized = await sharp(buffer)
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 85 })
      .toBuffer();

    const path = `${user.id}/logo.webp`;
    const { error: uploadError } = await serviceClient.storage
      .from("logos")
      .upload(path, resized, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) return { error: "Logo upload failed. Try again." };

    const { data: urlData } = serviceClient.storage
      .from("logos")
      .getPublicUrl(path);
    logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
  }

  // Cover image — header background on public page
  let coverImageUrl: string | null | undefined;
  if (removeCoverImage) {
    // Best-effort delete; missing file is non-fatal.
    await serviceClient.storage
      .from("logos")
      .remove([`${user.id}/cover.webp`])
      .catch(() => undefined);
    coverImageUrl = null;
  } else if (coverFile && coverFile.size > 0) {
    if (!ALLOWED_TYPES.includes(coverFile.type)) {
      return { error: "Cover image must be PNG, JPG, or WebP." };
    }
    if (coverFile.size > MAX_COVER_SIZE) {
      return { error: "Cover image must be under 5 MB." };
    }
    const buffer = Buffer.from(await coverFile.arrayBuffer());
    const resized = await sharp(buffer)
      .resize(1600, 600, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer();
    const path = `${user.id}/cover.webp`;
    const { error: uploadError } = await serviceClient.storage
      .from("logos")
      .upload(path, resized, {
        contentType: "image/webp",
        upsert: true,
      });
    if (uploadError) return { error: "Cover image upload failed. Try again." };
    const { data: urlData } = serviceClient.storage
      .from("logos")
      .getPublicUrl(path);
    coverImageUrl = `${urlData.publicUrl}?t=${Date.now()}`;
  }

  // Cover color — accept brand name or #hex; empty string clears.
  let coverColor: string | null | undefined;
  if (coverColorRaw !== null) {
    if (coverColorRaw.trim() === "") {
      coverColor = null;
    } else {
      const sanitized = sanitizeCoverColor(coverColorRaw);
      if (sanitized) coverColor = sanitized;
    }
  }

  // Merge cover fields into existing settings JSONB without clobbering siblings.
  let settingsPatch: Record<string, unknown> | undefined;
  if (coverImageUrl !== undefined || coverColor !== undefined) {
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("settings")
      .eq("id", user.id)
      .single();

    const current =
      (currentProfile?.settings as Record<string, unknown> | null) ?? {};
    settingsPatch = { ...current };
    if (coverImageUrl !== undefined) {
      if (coverImageUrl === null) delete settingsPatch.cover_image_url;
      else settingsPatch.cover_image_url = coverImageUrl;
    }
    if (coverColor !== undefined) {
      if (coverColor === null) delete settingsPatch.cover_color;
      else settingsPatch.cover_color = coverColor;
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      instagram_handle: instagramHandle || null,
      bio: bio || null,
      timezone,
      location: location || null,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
      ...(bookingMode ? { booking_mode: bookingMode } : {}),
      ...(settingsPatch ? { settings: settingsPatch } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  if (bookingMode) {
    void writeAudit({
      action: "booking_mode_changed",
      actor: user.id,
      category: "settings",
      details: { to: bookingMode },
    });
  }

  return { success: true };
}
