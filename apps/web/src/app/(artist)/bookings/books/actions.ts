"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { parseBooksSettings } from "@/lib/books-settings";
import { updateProfileSettings } from "@/lib/server/profile-settings";

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
  // Scheduled open date (P3f), the counterpart to the close date above.
  const opensAt = (formData.get("booking_opens_at") as string) || null;

  const closedMessage =
    (formData.get("books_closed_message") as string)?.trim() || null;
  if (closedMessage && closedMessage.length > 280) {
    return { error: "closed message must be 280 characters or fewer" };
  }

  let previousBooksOpen = false;
  const result = await updateProfileSettings(supabase, user.id, (current) => {
    // Spread the parsed current books_settings so sibling keys the artist owns
    // elsewhere (notably form_appearance, set via saveFormAppearanceAction) are
    // preserved instead of being reset to their defaults on every save.
    const currentBooks = parseBooksSettings(current.books_settings);
    previousBooksOpen = currentBooks.books_open;
    return {
      ...current,
      books_settings: {
        ...currentBooks,
        books_open: booksOpen,
        booking_cap: bookingCap,
        booking_opens_at: opensAt,
        booking_window_ends_at: windowEndsAt,
        books_closed_message: closedMessage,
      },
    };
  });

  if (!result.ok) return { error: result.error };

  // Audit only a real TRANSITION (same gate as the mobile routes): books_opened must mean
  // the flag flipped, not "saved the form while open".
  if (booksOpen !== previousBooksOpen) {
    void writeAudit({
      action: booksOpen ? "books_opened" : "books_closed",
      actor: user.id,
      category: "settings",
      details: { books_open: booksOpen },
    });
  }

  revalidatePath("/bookings/books");
  revalidatePath("/bookings/settings");
  return { success: true };
}
