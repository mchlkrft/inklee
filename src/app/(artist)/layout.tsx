import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NavBar from "@/components/nav-bar";
import { createClient } from "@/lib/supabase/server";

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
    .select("display_name, slug")
    .eq("id", user.id)
    .single();

  const slug = profile?.slug ?? "";
  const displayName = profile?.display_name ?? "account";

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

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar slug={slug} displayName={displayName} unreadCount={unreadCount} />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 pb-28 md:px-6 md:py-8 md:pb-8">
        {children}
      </main>
    </div>
  );
}
