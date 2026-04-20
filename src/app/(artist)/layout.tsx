import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/signup/actions";

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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            inklee
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              requests
            </Link>
            <Link
              href="/dashboard/calendar"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              calendar
            </Link>
            <Link
              href="/dashboard/clients"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              clients
            </Link>
            {profile && (
              <Link
                href={`/${profile.slug}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                /{profile.slug}
              </Link>
            )}
            <Link
              href="/settings/slots"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              slots
            </Link>
            <Link
              href="/settings/fields"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              form
            </Link>
            <Link
              href="/settings/templates"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              emails
            </Link>
            <Link
              href="/settings/profile"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              settings
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
