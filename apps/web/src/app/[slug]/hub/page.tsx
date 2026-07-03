import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { CalendarCheck, ExternalLink } from "lucide-react";
import { serviceClient } from "@/lib/supabase/service";
import { parseBioPageSettings, BIO_SOCIAL_META } from "@/lib/bio-page-settings";
import { resolveCoverColor, resolveCoverImage } from "@/lib/public-cover";
import { publicArtistUrl, publicHubUrl } from "@/lib/public-url";
import { clampDescription } from "@/lib/seo";
import { SocialIcon } from "./social-icon";

// The Inklee Hub (a.k.a. "Linklee"): an OPTIONAL, standalone link-in-bio page
// for an artist, at /<slug>/hub (pretty URL l.inkl.ee/<slug> is a rewrite, added
// separately). It is NOT the booking page and never replaces it -- booking stays
// the artist's primary surface at /<slug>. The Hub is noindex'd so it never
// competes with the booking page for search ranking.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("display_name, bio")
    .eq("slug", slug)
    .eq("account_status", "active")
    .single();

  if (!profile?.display_name) {
    return { title: "Links · Inklee", robots: { index: false } };
  }
  const name = profile.display_name as string;
  const bio = (profile.bio as string | null)?.trim();
  return {
    title: `${name} · Links`,
    description: clampDescription(bio || `Links from ${name} on Inklee.`),
    alternates: { canonical: publicHubUrl(slug) },
    robots: { index: false },
  };
}

export default async function ArtistHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select(
      "id, display_name, bio, logo_url, instagram_handle, location, settings",
    )
    .eq("slug", slug)
    .eq("account_status", "active")
    .single();

  if (!profile) notFound();

  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const bioPage = parseBioPageSettings(settings.bio_page);
  const blocks = bioPage.blocks;
  const socials = bioPage.socials;
  // Fall back to the profile bio under the name only when the artist hasn't
  // added their own text block, so an unconfigured Hub still says something.
  const hasTextBlock = blocks.some((b) => b.type === "text");
  const coverImage = resolveCoverImage(settings.cover_image_url);
  const coverColor = resolveCoverColor(settings.cover_color);
  const bookingUrl = publicArtistUrl(slug);

  const pageStyle: React.CSSProperties = coverImage
    ? {
        backgroundImage: `url(${coverImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : coverColor
      ? { backgroundColor: coverColor }
      : {};

  return (
    <div
      className="relative flex min-h-screen flex-col bg-brand-charcoal text-brand-bone"
      style={pageStyle}
    >
      {coverImage && (
        <div aria-hidden className="absolute inset-0 bg-brand-charcoal/70" />
      )}

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 pt-16 pb-10 text-center">
        {profile.logo_url && (
          <div className="relative h-24 w-24 overflow-hidden rounded-full ring-2 ring-brand-bone/25">
            <Image
              src={profile.logo_url}
              alt={profile.display_name}
              fill
              className="object-cover"
            />
          </div>
        )}
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-brand-bone">
          {profile.display_name}
        </h1>
        {(profile.location || profile.instagram_handle) && (
          <div className="mt-1 flex items-center justify-center gap-2 text-sm text-brand-bone/65">
            {profile.location && <span>{profile.location}</span>}
            {profile.location && profile.instagram_handle && (
              <span aria-hidden>·</span>
            )}
            {profile.instagram_handle && (
              <span>@{profile.instagram_handle}</span>
            )}
          </div>
        )}
        {!hasTextBlock && profile.bio && (
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-brand-bone/75">
            {profile.bio}
          </p>
        )}

        {socials.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
            {socials.map((s) => (
              <a
                key={s.platform}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={BIO_SOCIAL_META[s.platform].label}
                className="text-brand-bone/80 transition-colors hover:text-brand-bone"
              >
                <SocialIcon platform={s.platform} className="h-6 w-6" />
              </a>
            ))}
          </div>
        )}

        <div className="mt-8 w-full space-y-3">
          {/* The artist's booking page as the built-in primary action, pinned
              above the arrangeable blocks. Booking stays separate; this is just
              a link to it. */}
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl bg-brand-mustard px-5 py-4 text-sm font-semibold text-brand-charcoal shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden />
            Book a tattoo
          </a>

          {/* The artist's ordered blocks: headlines + text render inline, link
              blocks render as buttons (inactive links are hidden). */}
          {blocks.map((block) => {
            if (block.type === "headline") {
              return (
                <p
                  key={block.id}
                  className="pt-2 text-base font-semibold text-brand-bone"
                >
                  {block.text}
                </p>
              );
            }
            if (block.type === "text") {
              return (
                <p
                  key={block.id}
                  className="text-sm leading-relaxed text-brand-bone/75"
                >
                  {block.text}
                </p>
              );
            }
            if (!block.isActive) return null;
            return (
              <a
                key={block.id}
                href={block.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center justify-between gap-3 rounded-2xl bg-brand-bone px-5 py-4 text-sm font-medium text-brand-charcoal shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <span className="truncate">{block.label}</span>
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-brand-charcoal/50"
                  aria-hidden
                />
              </a>
            );
          })}
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap justify-center gap-x-4 gap-y-2 px-6 py-6 text-xs text-brand-bone/45">
        <Link href="/terms" className="transition-colors hover:text-brand-bone">
          Terms
        </Link>
        <Link
          href="/privacy"
          className="transition-colors hover:text-brand-bone"
        >
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/" className="transition-colors hover:text-brand-bone">
          Powered by inklee
        </Link>
      </footer>
    </div>
  );
}
