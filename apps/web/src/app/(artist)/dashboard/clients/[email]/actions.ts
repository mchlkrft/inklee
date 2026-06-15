"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type State = { error: string } | { success: true } | null;

export async function saveClientNotesAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const email = formData.get("customer_email") as string;
  const notes = (formData.get("notes") as string).trim();

  if (!email) return { error: "missing customer email" };

  const { error } = await supabase.from("client_notes").upsert(
    {
      artist_id: user.id,
      customer_email: email,
      notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "artist_id,customer_email" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/clients/${encodeURIComponent(email)}`);
  return { success: true };
}
