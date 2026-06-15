"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseBioPageSettings,
  type BioPageSettings,
} from "@/lib/bio-page-settings";

type State =
  | { error: string }
  | { success: true; note?: string; settings: BioPageSettings }
  | null;

export async function saveBioPageAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const headline =
    ((formData.get("hub_headline") as string | null) ?? "").trim() || null;
  const text =
    ((formData.get("hub_text") as string | null) ?? "").trim() || null;

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

  let socialsInput: unknown = [];
  const socialsRaw = formData.get("socials");
  if (typeof socialsRaw === "string" && socialsRaw.trim()) {
    try {
      socialsInput = JSON.parse(socialsRaw);
    } catch {
      return { error: "Could not read the socials. Try again." };
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", user.id)
    .single();

  const currentSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const currentBio = parseBioPageSettings(currentSettings.bio_page);

  // The Link Hub editor owns only headline / text / links / socials. Spread the
  // current bio_page first so bookingPolicy + module visibility (`hidden`) —
  // edited on /bookings/settings — are preserved untouched. Round-trip through
  // the shared parser so every field is validated + sanitized in one place.
  const settings: BioPageSettings = parseBioPageSettings({
    ...currentBio,
    headline,
    text,
    customLinks: linksInput,
    socials: socialsInput,
  });

  const inputSocialCount = Array.isArray(socialsInput)
    ? socialsInput.length
    : 0;
  const droppedLinks = inputLinkCount - settings.customLinks.length;
  const droppedSocials = inputSocialCount - settings.socials.length;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...currentSettings, bio_page: settings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/link-hub");
  if (profile?.slug) revalidatePath(`/${profile.slug}/hub`);

  // Mirror the mobile editor's buildSavedNote: report dropped links AND socials
  // so an entry the parser sanitized away isn't silently lost.
  const parts: string[] = [];
  if (droppedLinks > 0) {
    parts.push(`${droppedLinks} link${droppedLinks === 1 ? "" : "s"}`);
  }
  if (droppedSocials > 0) {
    parts.push(`${droppedSocials} social${droppedSocials === 1 ? "" : "s"}`);
  }
  if (parts.length > 0) {
    return {
      success: true,
      settings,
      note: `Saved. ${parts.join(" and ")} skipped (unsafe or invalid URL).`,
    };
  }
  return { success: true, settings };
}
