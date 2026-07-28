"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveConfirmationCore } from "@/lib/server/confirmation-write";

type State = { error: string } | { success: true } | null;

/** Save the artist's custom confirmation page. Thin: every rule, including
 *  the entitlement refusal, lives in saveConfirmationCore so the mobile route
 *  cannot drift from this one. */
export async function saveConfirmationPageAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const result = await saveConfirmationCore(supabase, user.id, {
    headline: formData.get("headline"),
    message: formData.get("message"),
    linkUrl: formData.get("linkUrl"),
    linkLabel: formData.get("linkLabel"),
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/bookings/booking-form");
  return { success: true };
}
