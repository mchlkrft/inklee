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

function readJsonArray(
  formData: FormData,
  key: string,
): { value: unknown[]; error?: string } {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw.trim()) return { value: [] };
  try {
    const parsed = JSON.parse(raw);
    return { value: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { value: [], error: `Could not read the ${key}. Try again.` };
  }
}

export async function saveBioPageAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const blocksInput = readJsonArray(formData, "blocks");
  if (blocksInput.error) return { error: blocksInput.error };
  const socialsInput = readJsonArray(formData, "socials");
  if (socialsInput.error) return { error: socialsInput.error };

  const inputBlockCount = blocksInput.value.length;
  const inputSocialCount = socialsInput.value.length;

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", user.id)
    .single();

  const currentSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const currentBio = parseBioPageSettings(currentSettings.bio_page);

  // The Link Hub editor owns only blocks + socials. Spread the current bio_page
  // first so bookingPolicy + module visibility (`hidden`) — edited on
  // /bookings/settings — are preserved untouched. Round-trip through the shared
  // parser so every field is validated + sanitized in one place.
  const settings: BioPageSettings = parseBioPageSettings({
    ...currentBio,
    blocks: blocksInput.value,
    socials: socialsInput.value,
  });

  const droppedBlocks = inputBlockCount - settings.blocks.length;
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

  // Report anything the parser sanitized away (empty headline/text, unsafe link
  // URL, deduped/invalid social) so an item doesn't vanish with only "Saved.".
  const parts: string[] = [];
  if (droppedBlocks > 0) {
    parts.push(`${droppedBlocks} item${droppedBlocks === 1 ? "" : "s"}`);
  }
  if (droppedSocials > 0) {
    parts.push(`${droppedSocials} social${droppedSocials === 1 ? "" : "s"}`);
  }
  if (parts.length > 0) {
    return {
      success: true,
      settings,
      note: `Saved. ${parts.join(" and ")} skipped (empty, invalid, or past the limit of 10).`,
    };
  }
  return { success: true, settings };
}
