import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import BookingForm from "./booking-form";

export default async function ArtistPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, bio, logo_url, instagram_handle, location, booking_mode",
    )
    .eq("slug", slug)
    .single();

  if (!profile) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 mx-auto w-full max-w-lg px-6 py-12 space-y-10">
        {/* Artist header */}
        <div className="flex flex-col items-center text-center space-y-3">
          {profile.logo_url && (
            <div className="h-16 w-16 rounded-full overflow-hidden border border-border relative">
              <Image
                src={profile.logo_url}
                alt={profile.display_name}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {profile.display_name}
            </h1>
            {profile.location && (
              <p className="text-sm text-muted-foreground">
                {profile.location}
              </p>
            )}
          </div>
          {profile.bio && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              {profile.bio}
            </p>
          )}
        </div>

        {/* Booking form */}
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-medium text-foreground">
              booking request
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              fill in the details and i&apos;ll get back to you
            </p>
          </div>
          <BookingForm
            artistSlug={slug}
            artistFirstName={profile.display_name.split(" ")[0]}
          />
        </div>
      </main>

      <footer className="px-6 py-6 flex justify-center gap-6 text-xs text-muted-foreground">
        <Link href="/terms" className="hover:text-foreground transition-colors">
          terms
        </Link>
        <Link
          href="/privacy"
          className="hover:text-foreground transition-colors"
        >
          privacy
        </Link>
        <Link
          href="/impressum"
          className="hover:text-foreground transition-colors"
        >
          impressum
        </Link>
        <span>·</span>
        <Link href="/" className="hover:text-foreground transition-colors">
          powered by inklee
        </Link>
      </footer>
    </div>
  );
}
