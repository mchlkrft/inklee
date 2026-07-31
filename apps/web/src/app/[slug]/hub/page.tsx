import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { CalendarCheck, ExternalLink } from "lucide-react";
import { serviceClient } from "@/lib/supabase/service";
import { publicBrandingHidden } from "@/lib/server/public-branding";
import { surfaceAppearance } from "@/lib/server/appearance";
import { accentHex } from "@inklee/shared/appearance";
import { COVER_COLORS } from "@inklee/shared/cover-colors";
import { templateStyles } from "@inklee/shared/page-template-styles";
import { loadHubFeatureData } from "@/lib/server/hub-feature-data";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { appearanceCustomAllowed } from "@/lib/server/entitlement-gates";
import {
  HubFeatureBlock,
  HubFeaturedCollectionBlock,
  HubImageGalleryBlock,
} from "./feature-blocks";
import {
  parseBioPageSettings,
  BIO_SOCIAL_META,
  isFeatureBlock,
} from "@/lib/bio-page-settings";
import { apexHref, publicArtistUrl, publicHubUrl } from "@/lib/public-url";
import { clampDescription } from "@/lib/seo";
import { SocialIcon } from "./social-icon";
import { HubAnalytics } from "./hub-analytics";

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

  const hideBranding = await publicBrandingHidden(profile.id as string);

  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const bioPage = parseBioPageSettings(settings.bio_page);
  const blocks = bioPage.blocks;
  const socials = bioPage.socials;
  // Fall back to the profile bio under the name only when the artist hasn't
  // added their own text block, so an unconfigured Hub still says something.
  const hasTextBlock = blocks.some((b) => b.type === "text");
  const bookingUrl = publicArtistUrl(slug);

  // Shared appearance system (Plus build P1). Emits nothing when the artist
  // customized nothing, so an unconfigured hub renders byte-identically to
  // before; the legacy cover fields are read through by the parser, so a Free
  // artist's existing look is unchanged either way.
  const appearance = await surfaceAppearance(
    profile.id as string,
    settings,
    "hub",
  );

  // Layout template (P2). Free resolves to `clean`, which IS today's layout,
  // so an existing hub is byte-identical; the entitlement boundary lives in
  // surfaceAppearance, not here.
  const tpl = templateStyles(appearance.resolved.template);

  // Cover image + colour through the same resolved appearance the booking page
  // uses (P3c), so the two public surfaces cannot disagree about an artist's
  // cover. Both were previously read straight from settings, which meant a
  // per-surface override was parsed and then ignored.
  const coverImage = appearance.resolved.backgroundImageUrl;
  const coverColor = accentHex(appearance.resolved.accent, COVER_COLORS);

  // Feature-block data (P2b). Queried ONLY for the blocks this artist actually
  // added, so a plain link hub still costs exactly one profile read.
  const featureData = await loadHubFeatureData({
    artistId: profile.id as string,
    settings,
    blocks,
    bookingUrl,
  });

  // Rich blocks (image_gallery, Stage 3) are Plus, gated on the SAME
  // `appearance_custom` entitlement as the custom appearance layer
  // (features.ts). Preserved in settings but hidden here on downgrade, mirroring
  // featured_collection. getAccountOverrides is request-cached (surfaceAppearance
  // already read it), so this adds no query. Fail-safe to false: a plan-read
  // blip hides a Plus block rather than 500ing a public page.
  let richBlocksAllowed = false;
  try {
    richBlocksAllowed = appearanceCustomAllowed(
      await getAccountOverrides(profile.id as string),
    );
  } catch {
    richBlocksAllowed = false;
  }

  const pageStyle: React.CSSProperties = {
    ...(coverImage
      ? {
          backgroundImage: `url(${coverImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : coverColor
        ? { backgroundColor: coverColor }
        : {}),
    ...(appearance.cssVars as React.CSSProperties),
  };

  // Footer links leave the artist namespace for apex-only routes, so they
  // must be host-aware. The hub renders on THREE hosts (apex path,
  // <slug>.inkl.ee/hub, <slug>.l.inkl.ee) — a relative /terms would be
  // rewritten under /<slug>/ or /<slug>/hub/ on the subdomains and 404.
  const termsHref = await apexHref("/terms");
  const privacyHref = await apexHref("/privacy");
  const homeHref = await apexHref("/");

  return (
    <div
      data-appearance={appearance.theme}
      className="relative flex min-h-screen flex-col bg-brand-charcoal text-brand-bone"
      style={pageStyle}
    >
      {coverImage && (
        <div aria-hidden className="absolute inset-0 bg-brand-charcoal/70" />
      )}

      <main className={`relative z-10 ${tpl.main}`}>
        {profile.logo_url && (
          <div className={tpl.avatar}>
            <Image
              src={profile.logo_url}
              alt={profile.display_name}
              fill
              className="object-cover"
            />
          </div>
        )}
        <h1 className={tpl.name}>{profile.display_name}</h1>
        {(profile.location || profile.instagram_handle) && (
          <div className={tpl.meta}>
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
          <p className={tpl.bio}>{profile.bio}</p>
        )}

        {socials.length > 0 && (
          <div
            className={`mt-5 flex flex-wrap items-center gap-4 ${tpl.socials}`}
          >
            {socials.map((s) => (
              <a
                key={s.platform}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={BIO_SOCIAL_META[s.platform].label}
                className="text-brand-bone/80 transition-colors hover:text-brand-bone"
                data-track="link"
                data-track-key={s.platform}
              >
                <SocialIcon platform={s.platform} className="h-6 w-6" />
              </a>
            ))}
          </div>
        )}

        <div className="mt-8 w-full space-y-3">
          {/* The artist's booking page as the built-in primary action, pinned
              above the arrangeable blocks. Booking stays separate; this is just
              a link to it.

              SUPPRESSED when the artist added a booking_form block (P2b): that
              block is the same CTA under their own placement, and rendering
              both would put two identical buttons on the page. Artists who add
              no block keep today's pinned default exactly. */}
          {!blocks.some((b) => b.type === "booking_form") && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-mustard px-5 py-4 text-sm font-semibold text-brand-charcoal shadow-sm transition-transform hover:-translate-y-0.5"
              data-track="block"
              data-track-key="booking_cta"
            >
              <CalendarCheck className="h-4 w-4" aria-hidden />
              Book a tattoo
            </a>
          )}

          {/* The artist's ordered blocks: headlines + text render inline, link
              blocks render as buttons (inactive links are hidden). */}
          {blocks.map((block) => {
            if (block.type === "headline") {
              return (
                <p key={block.id} className={`pt-2 ${tpl.headline}`}>
                  {block.text}
                </p>
              );
            }
            if (block.type === "text") {
              return (
                <p key={block.id} className={tpl.text}>
                  {block.text}
                </p>
              );
            }
            // Feature blocks (P2b): content-free, rendered from the artist's
            // existing data. Each returns null when its data is empty, so an
            // added-but-unused block never leaves a bare heading on the page.
            // A reference block, so it is matched before the content-free
            // feature family rather than inside it.
            if (block.type === "featured_collection") {
              return (
                <HubFeaturedCollectionBlock
                  key={block.id}
                  collectionId={block.collectionId}
                  data={featureData}
                  tpl={tpl}
                  shopUrl={bookingUrl}
                />
              );
            }
            if (isFeatureBlock(block)) {
              return (
                <HubFeatureBlock
                  key={block.id}
                  type={block.type}
                  data={featureData}
                  tpl={tpl}
                />
              );
            }
            // A Plus rich block: rendered only for an entitled artist. Hidden
            // (not deleted) on downgrade, same as featured_collection.
            if (block.type === "image_gallery") {
              if (!richBlocksAllowed) return null;
              return (
                <HubImageGalleryBlock
                  key={block.id}
                  images={block.images}
                  layout={block.layout}
                  tpl={tpl}
                />
              );
            }
            if (!block.isActive) return null;
            return (
              <a
                key={block.id}
                href={block.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={`flex items-center justify-between gap-3 shadow-sm transition-transform hover:-translate-y-0.5 ${tpl.link}`}
                data-track="link"
                data-track-key={block.label}
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

      <HubAnalytics slug={slug} />

      <footer className="relative z-10 flex flex-wrap justify-center gap-x-4 gap-y-2 px-6 py-6 text-xs text-brand-bone/45">
        <Link
          href={termsHref}
          className="transition-colors hover:text-brand-bone"
        >
          Terms
        </Link>
        <Link
          href={privacyHref}
          className="transition-colors hover:text-brand-bone"
        >
          Privacy
        </Link>
        {!hideBranding && (
          <>
            <span aria-hidden>·</span>
            <Link
              href={homeHref}
              className="transition-colors hover:text-brand-bone"
            >
              Powered by inklee
            </Link>
          </>
        )}
      </footer>
    </div>
  );
}
