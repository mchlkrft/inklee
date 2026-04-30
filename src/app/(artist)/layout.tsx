import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/components/nav-bar";

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
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", user.id)
      .eq("is_read", false);
    unreadCount = count ?? 0;
  } catch {
    // notifications table may not be ready — default to 0
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar
        slug={slug}
        displayName={displayName}
        unreadCount={unreadCount ?? 0}
      />
      {/* pb-28 accounts for fixed bottom tab bar (h-[4.5rem] ≈ 72px) + iOS safe area */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 pb-28 md:px-6 md:py-8 md:pb-8">
        {children}
      </main>
    </div>
  );
}
