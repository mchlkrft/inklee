import { createClient } from "@/lib/supabase/server";
import { parseBooksSettings } from "@/lib/books-settings";
import BooksForm from "./books-form";

export default async function BooksSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user!.id)
    .single();

  const profileSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const booksSettings = parseBooksSettings(profileSettings.books_settings);

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold text-foreground">books</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          control when and how many booking requests you accept
        </p>
      </div>
      <BooksForm settings={booksSettings} />
    </div>
  );
}
