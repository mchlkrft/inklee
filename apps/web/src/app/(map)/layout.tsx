import { createClient } from "@/lib/supabase/server";
import ArtistWorkspaceShell from "@/components/app-shell/artist-workspace-shell";

// The auth-OPTIONAL frame for the map routes (go-live plan S2): a signed-in
// artist gets the identical workspace chrome the (artist) group renders (one
// shared component, so /map/[id] keeps the sidebar, top bars, bottom nav, and
// the day-grain activity touch it had before the route move; the immersive
// /map shell covers the chrome with its fixed takeover exactly as before).
// An anonymous visitor gets a bare frame: the pages own their public chrome
// and their dark-state login redirects; this layout never redirects.
export default async function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <>{children}</>;
  return (
    <ArtistWorkspaceShell userId={user.id}>{children}</ArtistWorkspaceShell>
  );
}
