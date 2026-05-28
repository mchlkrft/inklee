"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseBioPageSettings,
  type BioModuleKey,
  type BioPageSettings,
} from "@/lib/bio-page-settings";

type State = { error: string } | { success: true; note?: string } | null;

export async function saveBioPageAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const bookingPolicy =
    ((formData.get("booking_policy") as string | null) ?? "").trim() || null;

  // Unchecked "Show" boxes are absent from FormData; absence => hidden.
  const hidden: BioModuleKey[] = [];
  if (formData.get("show_links") !== "on") hidden.push("links");
  if (formData.get("show_policy") !== "on") hidden.push("policy");
  if (formData.get("show_shop") !== "on") hidden.push("shop");

  let linksInput: unknown = [];
  const linksRaw = formData.get("custom_links");
  if (typeof linksRaw === "string" && linksRaw.trim()) {
    try {
      linksInput = JSON.parse(linksRaw);
    } catch {
      return { error: "Could not read the links. Try again." };
    }
  }
  const inputLinkCount = Array.isArray(linksInput) ? linksInput.length : 0;

  // Round-trip through the parser so every field is validated + sanitized in one
  // place: URL safety (no javascript:/data:), length caps, module-key filtering.
  const settings: BioPageSettings = parseBioPageSettings({
    bookingPolicy,
    customLinks: linksInput,
    hidden,
  });

  const dropped = inputLinkCount - settings.customLinks.length;

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", user.id)
    .single();

  const currentSettings = (profile?.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...currentSettings, bio_page: settings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/bio-page");
  if (profile?.slug) revalidatePath(`/${profile.slug}`);

  if (dropped > 0) {
    return {
      success: true,
      note: `Saved. ${dropped} link${dropped === 1 ? "" : "s"} skipped (unsafe or invalid URL).`,
    };
  }
  return { success: true };
}
