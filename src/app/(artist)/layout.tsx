import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { parseBooksSettings } from "@/lib/books-settings";
import { isDateKeyBefore, todayInTimeZone } from "@/lib/date-utils";
import { Sidebar, MobileTopBar, MobileBottomNav } from "@/components/app-shell";
import WorkspaceTopBar from "@/components/app-shell/workspace-top-bar";
import BooksStatusPill from "@/components/app-shell/books-status-pill";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ArtistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, slug, settings, timezone")
    .eq("id", user.id)
    .single();

  const slug = profile?.slug ?? "";
  const displayName = profile?.display_name ?? "account";

  const profileSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const today = todayInTimeZone(profile?.timezone ?? "Europe/Berlin");
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(booksSettings.booking_window_ends_at, today);
  const booksOpen = booksSettings.books_open && !windowExpired;

  let booksRemaining: number | null = null;
  if (booksOpen && booksSettings.booking_cap !== null) {
    const { count } = await serviceClient
      .from("booking_requests")
      .select("*", { count: "exact", head: true })
      .eq("artist_id", user.id)
      .in("status", ["pending", "approved", "deposit_pending"]);
    booksRemaining = Math.max(0, booksSettings.booking_cap - (count ?? 0));
  }

  let unreadCount = 0;
  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("[notifications/unread-count]", error.message, {
        artistId: user.id,
      });
    } else {
      unreadCount = count ?? 0;
    }
  } catch (error) {
    console.error("[notifications/unread-count]", error, {
      artistId: user.id,
    });
  }

  const statusPill = (
    <BooksStatusPill
      open={booksOpen}
      remaining={booksRemaining}
      windowEndDate={booksSettings.booking_window_ends_at}
    />
  );
  // Compact variant for the mobile top bar — just dot + Open/Closed, no
  // "Books " prefix and no trailing detail, so it fits next to the bell
  // and account menu on narrow screens.
  const mobileStatusPill = (
    <BooksStatusPill
      open={booksOpen}
      remaining={booksRemaining}
      windowEndDate={booksSettings.booking_window_ends_at}
      compact
    />
  );

  return (
    <div className="min-h-screen bg-[color:var(--color-shell-bg)] text-brand-bone md:p-3">
      <div
        data-appearance="light"
        className="md:rounded-[28px] bg-[color:var(--color-workspace-bg)] text-[color:var(--color-workspace-fg)] flex flex-col md:flex-row min-h-screen md:min-h-[calc(100vh-1.5rem)]"
      >
        <Sidebar unreadCount={unreadCount} />

        <MobileTopBar
          slug={slug}
          displayName={displayName}
          unreadCount={unreadCount}
          statusPill={mobileStatusPill}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <WorkspaceTopBar
            slug={slug}
            displayName={displayName}
            unreadCount={unreadCount}
            statusPill={statusPill}
          />
          <main className="flex-1 mx-auto w-full max-w-5xl px-4 pb-28 pt-20 md:px-8 md:pb-12 md:pt-6">
            {children}
          </main>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
}
