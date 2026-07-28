"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveAppearanceCore } from "@/lib/server/appearance-write";

type State = { error: string } | { success: true } | null;

/** Save an appearance change (global, or scoped to one surface). The
 *  entitlement is enforced in the shared core, not here, so the web action and
 *  the mobile route cannot drift. */
export async function saveAppearanceAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const raw = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };

  const result = await saveAppearanceCore(supabase, user.id, {
    theme: raw("theme"),
    // An empty accent means "no accent", which must clear rather than be
    // dropped, so it is passed explicitly as null.
    accent: formData.has("accent") ? (raw("accent") ?? null) : undefined,
    font: raw("font"),
    buttonTreatment: raw("buttonTreatment"),
    buttonRadius: raw("buttonRadius"),
    surface: raw("surface"),
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/settings/appearance");
  return { success: true };
}
