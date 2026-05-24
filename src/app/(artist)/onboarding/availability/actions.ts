"use server";

import { createClient } from "@/lib/supabase/server";
import { parseBooksSettings } from "@/lib/books-settings";
import { redirect } from "next/navigation";

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

  const { data: existing } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const currentSettings = (existing?.settings ?? {}) as Record<string, unknown>;
  const currentBooks = parseBooksSettings(currentSettings.books_settings);

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...currentSettings,
        books_settings: {
          ...currentBooks,
          books_open: booksOpen,
          books_closed_message: booksOpen
            ? currentBooks.books_closed_message
            : closedMessage,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  redirect("/onboarding/form");
}
