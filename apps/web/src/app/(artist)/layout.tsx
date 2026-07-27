import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ArtistWorkspaceShell from "@/components/app-shell/artist-workspace-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Auth gate + the shared workspace chrome. The chrome itself lives in
// ArtistWorkspaceShell (one source of truth) so the auth-optional (map) group
// renders the identical shell for signed-in artists (go-live plan S2).
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

  return (
    <ArtistWorkspaceShell userId={user.id}>{children}</ArtistWorkspaceShell>
  );
}
