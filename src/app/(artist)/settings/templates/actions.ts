"use server";

import { createClient } from "@/lib/supabase/server";
import {
  templateBodySchema,
  DEFAULT_SUBJECTS,
} from "@/lib/email/booking-templates";
import { revalidatePath } from "next/cache";

type State = { error: string } | { success: true } | null;

type EmailType =
  | "customer_booking_submitted"
  | "customer_booking_approved"
  | "customer_booking_rejected"
  | "customer_booking_cancelled_by_artist"
  | "artist_new_booking_request";

export async function saveTemplateAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const type = formData.get("type") as EmailType;
  const body = (formData.get("body") as string).trim();

  const parsed = templateBodySchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const subject = DEFAULT_SUBJECTS[type] ?? "inklee";

  const { error } = await supabase
    .from("email_templates")
    .upsert(
      { artist_id: user.id, type, subject, body: parsed.data },
      { onConflict: "artist_id,type" },
    );

  if (error) return { error: error.message };

  revalidatePath("/settings/templates");
  return { success: true };
}
