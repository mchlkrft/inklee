"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  saveDiscountCore,
  setDiscountActiveCore,
} from "@/lib/server/discount-write";

type State = { error: string } | { success: true } | null;

async function artist() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/** Thin wrappers. Every rule, including the entitlement refusal and the
 *  duplicate-code handling, lives in the cores so the mobile route cannot
 *  drift from this. */
export async function saveDiscountAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const id = (formData.get("id") as string) || undefined;
  const result = await saveDiscountCore(
    supabase,
    userId,
    {
      code: formData.get("code"),
      kind: formData.get("kind"),
      value: formData.get("value"),
      minSubtotal: formData.get("minSubtotal"),
      maxRedemptions: formData.get("maxRedemptions"),
      startsAt: formData.get("startsAt"),
      endsAt: formData.get("endsAt"),
      active: formData.get("active") !== "off",
    },
    id,
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/goods/discounts");
  return { success: true };
}

export async function setDiscountActiveAction(
  id: string,
  active: boolean,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await setDiscountActiveCore(supabase, userId, id, active);
  if (!result.ok) return { error: result.error };

  revalidatePath("/goods/discounts");
  return { success: true };
}
