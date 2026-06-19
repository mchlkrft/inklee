"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { guardedSharp } from "@/lib/image-guard";
import { writeAudit } from "@/lib/audit";
import { normalizeProfileFields } from "@inklee/shared/profile-validation";
import { sanitizeCoverColor } from "@inklee/shared/cover-colors";

type State = { error: string } | { success: true } | null;

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
// Kept under Vercel's ~4.5MB serverless request-body cap. A 5MB cover was
// accepted here but rejected by the platform before the action ran, surfacing
// as an opaque 500 instead of a friendly message. The same limit is enforced
// client-side in profile-form.tsx so oversized files never leave the browser.
const MAX_COVER_SIZE = 4 * 1024 * 1024; // 4MB

export async function updateProfileAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const fields = normalizeProfileFields({
    displayName: formData.get("display_name"),
    bio: formData.get("bio"),
    instagramHandle: formData.get("instagram_handle"),
    location: formData.get("location"),
  });
  if (!fields.ok) return { error: fields.error };
  const { displayName, bio, instagramHandle, location } = fields.value;

  const timezone = formData.get("timezone") as string;
  const bookingMode = formData.get("booking_mode") as
    | "preferred_date"
    | "fixed_slots"
    | null;
  const logoFile = formData.get("logo") as File | null;
  const coverFile = formData.get("cover_image") as File | null;
  const removeCoverImage = formData.get("remove_cover_image") === "1";
  const coverColorRaw = formData.get("cover_color") as string | null;

  let logoUrl: string | undefined;

  if (logoFile && logoFile.size > 0) {
    if (!ALLOWED_TYPES.includes(logoFile.type)) {
      return { error: "Logo must be PNG, JPG, or WebP." };
    }
    if (logoFile.size > MAX_SIZE) {
      return { error: "Logo must be under 2 MB." };
    }

    let resized: Buffer;
    try {
      const buffer = Buffer.from(await logoFile.arrayBuffer());
      resized = await guardedSharp(buffer)
        .resize(512, 512, { fit: "cover", position: "centre" })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      return {
        error: "Could not process that image. Try a different file or format.",
      };
    }

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
    let resized: Buffer;
    try {
      const buffer = Buffer.from(await coverFile.arrayBuffer());
      resized = await guardedSharp(buffer)
        .resize(1600, 600, { fit: "cover", position: "centre" })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      return {
        error: "Could not process that image. Try a different file or format.",
      };
    }
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
