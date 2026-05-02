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
  if (!logoFile || logoFile.size === 0) return { error: "no file selected" };

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
  const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error } = await supabase
    .from("profiles")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  revalidatePath("/onboarding/done");
  return { success: true };
}
