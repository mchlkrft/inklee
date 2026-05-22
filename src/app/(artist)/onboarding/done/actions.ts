"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

type State = { error: string } | { success: true } | null;

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024;

export async function uploadOnboardingLogoAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "not authenticated" };

  const logoFile = formData.get("logo") as File | null;
  if (!logoFile || logoFile.size === 0) return { error: "No file selected." };

  const name = logoFile.name.toLowerCase();
  if (
    logoFile.type === "image/heic" ||
    logoFile.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  ) {
    return {
      error:
        "iPhone HEIC photos aren’t supported. Choose a JPG or PNG instead.",
    };
  }
  if (!ALLOWED_TYPES.includes(logoFile.type)) {
    return {
      error: "That file isn’t supported — use a PNG, JPG, or WebP image.",
    };
  }
  if (logoFile.size > MAX_SIZE) {
    return { error: "That image is too large — please keep it under 2 MB." };
  }

  // Image decoding can throw on corrupt or unexpected input; keep it from
  // bubbling up into a full-screen error boundary.
  let resized: Buffer;
  try {
    const buffer = Buffer.from(await logoFile.arrayBuffer());
    resized = await sharp(buffer)
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return {
      error: "We couldn’t process that image — try a different PNG or JPG.",
    };
  }

  const path = `${user.id}/logo.webp`;
  const { error: uploadError } = await serviceClient.storage
    .from("logos")
    .upload(path, resized, {
      contentType: "image/webp",
      upsert: true,
    });

  if (uploadError) return { error: "Logo upload failed — please try again." };

  const { data: urlData } = serviceClient.storage
    .from("logos")
    .getPublicUrl(path);
  const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error } = await supabase
    .from("profiles")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  revalidatePath("/onboarding/done");
  return { success: true };
}
