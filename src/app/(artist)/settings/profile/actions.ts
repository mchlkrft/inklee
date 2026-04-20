"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import sharp from "sharp";

type State = { error: string } | { success: true } | null;

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function updateProfileAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "not authenticated" };

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

  if (!displayName) return { error: "display name is required" };
  if (bio && bio.length > 280)
    return { error: "bio must be 280 characters or fewer" };

  let logoUrl: string | undefined;

  if (logoFile && logoFile.size > 0) {
    if (!ALLOWED_TYPES.includes(logoFile.type)) {
      return { error: "logo must be png, jpg, or webp" };
    }
    if (logoFile.size > MAX_SIZE) {
      return { error: "logo must be under 2mb" };
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

    if (uploadError) return { error: "logo upload failed — try again" };

    const { data: urlData } = serviceClient.storage
      .from("logos")
      .getPublicUrl(path);
    logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  return { success: true };
}
