import { createClient } from "@/lib/supabase/server";
import { parseFormSettings } from "@/lib/form-settings";
import { parseBooksSettings } from "@/lib/books-settings";
import Link from "next/link";
import PublicPageClient from "./public-page-client";

export default async function PublicPageManagementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", user!.id)
    .single();

  const { count: customFieldCount } = await supabase
    .from("custom_fields")
    .select("*", { count: "exact", head: true })
    .eq("artist_id", user!.id)
    .eq("active", true)
    .is("deleted_at", null);

  const profileSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const formSettings = parseFormSettings(profileSettings.form_settings);
  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const slug = profile?.slug ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const publicUrl = `${appUrl}/${slug}`;

  const now = new Date();
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    new Date(booksSettings.booking_window_ends_at) < now;
  const isOpen = booksSettings.books_open && !windowExpired;

  const activeFieldSummary =
    [
      formSettings.show_reference_link && "Reference link",
      formSettings.show_image_upload && "Images",
      (customFieldCount ?? 0) > 0 && `${customFieldCount} custom fields`,
    ]
      .filter(Boolean)
      .join(", ") || "Standard fields only";

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Public page</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your client-facing booking page. Share this URL with customers.
        </p>
      </div>

      <PublicPageClient publicUrl={publicUrl} slug={slug} />

      <div className="rounded-md border border-border divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Books</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isOpen
                ? "Currently accepting requests"
                : "Closed to new requests"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-medium ${isOpen ? "text-green-500" : "text-muted-foreground"}`}
            >
              {isOpen ? "Open" : "Closed"}
            </span>
            <Link
              href="/bookings/books"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Edit &rarr;
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Form</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeFieldSummary}
            </p>
          </div>
          <Link
            href="/bookings/form"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Edit &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
