"use server";

import { createClient } from "@/lib/supabase/server";
import { parseBooksSettings } from "@/lib/books-settings";
import { redirect } from "next/navigation";
import { recordGrowthEvent } from "@/lib/growth/record-event";
import { updateProfileSettings } from "@/lib/server/profile-settings";

type State = { error: string } | null;

export async function saveOnboardingAvailabilityAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const booksOpen = formData.get("books_open") !== "false";
  const closedMessage =
    (formData.get("books_closed_message") as string | null)?.trim() || null;

  const result = await updateProfileSettings(
    supabase,
    user.id,
    (currentSettings) => {
      const currentBooks = parseBooksSettings(currentSettings.books_settings);
      return {
        ...currentSettings,
        books_settings: {
          ...currentBooks,
          books_open: booksOpen,
          books_closed_message: booksOpen
            ? currentBooks.books_closed_message
            : closedMessage,
        },
      };
    },
    { updated_at: new Date().toISOString() },
  );

  if (!result.ok) return { error: result.error.toLowerCase() };

  void recordGrowthEvent(
    { event: "onboarding_step_completed", props: { step: "availability" } },
    { artistId: user.id, source: "web", email: user.email },
  );

  redirect("/onboarding/form");
}
