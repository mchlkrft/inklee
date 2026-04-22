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

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar slug={slug} displayName={displayName} />
      {/* pb-14 on mobile gives room for the fixed bottom tab bar */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-8 pb-20 md:pb-8">
        {children}
      </main>
    </div>
  );
}
