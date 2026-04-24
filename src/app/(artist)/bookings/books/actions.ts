"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";

type State = { error: string } | { success: true } | null;

export async function saveBooksSettingsAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const booksOpen = formData.get("books_open") === "true";

  const capRaw = formData.get("booking_cap") as string;
  const bookingCap =
    capRaw && !isNaN(Number(capRaw)) && Number(capRaw) > 0
      ? Number(capRaw)
      : null;

  const windowEndsAt =
    (formData.get("booking_window_ends_at") as string) || null;

  const closedMessage =
    (formData.get("books_closed_message") as string)?.trim() || null;
  if (closedMessage && closedMessage.length > 280) {
    return { error: "closed message must be 280 characters or fewer" };
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const current = (existing?.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...current,
        books_settings: {
          books_open: booksOpen,
          booking_cap: bookingCap,
          booking_window_ends_at: windowEndsAt,
          books_closed_message: closedMessage,
        },
      },
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  void writeAudit({
    action: booksOpen ? "books_opened" : "books_closed",
    actor: user.id,
    category: "settings",
    details: { books_open: booksOpen },
  });

  revalidatePath("/bookings/books");
  return { success: true };
}
