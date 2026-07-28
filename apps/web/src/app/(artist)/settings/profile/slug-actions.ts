"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { renameSlugCore } from "@/lib/server/slug-rename";

type State = { error: string } | { success: true; slug: string } | null;

/** Rename the artist's public URL. Thin: every rule lives in renameSlugCore
 *  so the mobile route cannot drift from it. */
export async function renameSlugAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const result = await renameSlugCore(supabase, user.id, formData.get("slug"));
  if (!result.ok) return { error: result.error };

  // The slug appears in the nav, the profile page and every "your link"
  // surface, so revalidate the artist shell rather than one route.
  revalidatePath("/", "layout");
  return { success: true, slug: result.slug };
}
