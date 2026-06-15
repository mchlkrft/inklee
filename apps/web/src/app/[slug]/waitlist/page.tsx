import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { serviceClient } from "@/lib/supabase/service";
import { publicArtistUrl } from "@/lib/public-url";
import WaitlistForm from "../waitlist-form";

// `generateMetadata` below sets robots: noindex per-request — Next.js
// rejects exporting both a static `metadata` and `generateMetadata` from
// the same file, so the noindex lives in the dynamic version.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await serviceClient
    .from("profiles")
    .select("display_name")
    .eq("slug", slug)
    .maybeSingle();
  const name = data?.display_name ?? "Inklee";
  return {
    title: `Join ${name}’s waitlist · Inklee`,
    description: `Sign up to ${name}’s tattoo waitlist — they’ll reach out when there’s an opening.`,
    robots: { index: false, follow: false },
  };
}

/**
 * Always-available waitlist surface for an artist.
 *
 * `/[slug]` toggles between the booking form and a books-closed waitlist
 * depending on availability — useful for the default visit. This page
 * bypasses that gating: it ALWAYS shows the waitlist form, no matter
 * whether books are open, closed, capped, or window-expired.
 *
 * Intended use: artists share this link separately while travelling so
 * they can collect city-specific signups without flipping their main
 * page into closed mode.
 */
export default async function PublicWaitlistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("display_name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!profile) notFound();

  return (
    <div
      data-appearance="light"
      className="min-h-screen bg-background text-foreground"
    >
      <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
        <div className="space-y-2">
          <Link
            href={publicArtistUrl(profile.slug ?? slug)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {profile.display_name ?? slug}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {profile.display_name ?? "The"} waitlist
          </h1>
          <p className="text-sm text-muted-foreground">
            Leave your details and join the waitlist.
          </p>
        </div>

        <div className="mt-8 rounded-[20px] border border-border p-5">
          <WaitlistForm artistSlug={profile.slug ?? slug} />
        </div>
      </div>
    </div>
  );
}
