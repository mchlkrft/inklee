import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { publicMapEnabled } from "@/lib/map-features";
import { getClientIp } from "@/lib/get-client-ip";
import { checkPublicMapDetailRateLimit } from "@/lib/ratelimit";
import { getPublicStudioPage } from "@/lib/server/studio-page";
import { SITE_URL } from "@/lib/seo";
import {
  webPageSchema,
  localBusinessSchema,
  breadcrumbListSchema,
} from "@/lib/jsonld";
import RandomizedLogo from "@/components/randomized-logo";
import {
  STUDIO_DATA_CREDIT,
  DATA_ATTRIBUTION_PATH,
  DATA_ATTRIBUTION_LINK_LABEL,
} from "@inklee/shared/map-attribution";
import {
  HOUSE_RULE_LABELS,
  type HouseRuleKey,
} from "@inklee/shared/studio-profile";
import { formatDateKey } from "@inklee/shared/date-utils";

// The public studio entity page (go-live plan S2b, founder decision D1
// 2026-07-27: in v1). The canonical public URL for a CLAIMED studio, per the
// ratified SEO strategy: indexable only when the full eight-condition gate
// passes, `noindex, follow` otherwise, and a 404 (never a thin page) for
// anything unclaimed, unpublished, or unapproved.
//
// Content is owner-declared or consented only. Nothing here is inferred: no
// ratings, no reviews, no derived styles, no unconfirmed hours.

export const runtime = "nodejs";

/**
 * One rate-limit decision per request, shared by `generateMetadata` and the
 * component body (React's cache dedupes within a request). They MUST agree:
 * a throttled response renders a placeholder body, and if metadata still said
 * `index: true` the placeholder could be indexed in place of the studio.
 * The throttled page is a 200 rather than a 503 because a page segment cannot
 * set a status code; `noindex` is what actually protects the index here.
 */
const studioPageRateLimit = cache(async () =>
  checkPublicMapDetailRateLimit(getClientIp(await headers())),
);

async function loadPage(slug: string) {
  if (!publicMapEnabled()) return null;
  return getPublicStudioPage(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) {
    return { robots: { index: false, follow: false } };
  }
  // Throttled requests render a placeholder body, so they must never claim to
  // be indexable (see studioPageRateLimit).
  const { allowed } = await studioPageRateLimit();
  const place = [page.city, page.country].filter(Boolean).join(", ");
  const title = place ? `${page.name}, ${place}` : page.name;
  const description =
    page.description?.slice(0, 300) ?? `${page.name} on the Inklee tattoo map.`;
  return {
    title,
    description,
    // The gate decides indexation; everything else is follow-only.
    robots:
      page.indexability.indexable && allowed
        ? { index: true, follow: true }
        : { index: false, follow: true },
    alternates: { canonical: `/studios/${slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/studios/${slug}`,
      type: "website",
      ...(page.photoUrls[0]
        ? { images: [{ url: `${SITE_URL}${page.photoUrls[0]}` }] }
        : {}),
    },
  };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default async function StudioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!publicMapEnabled()) notFound();

  // Same abuse control as every other anonymous map read (the S1 invariant:
  // the auth gate's replacement is the per-IP limiter, refuse before work).
  const { allowed } = await studioPageRateLimit();
  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          The map is busy right now.
        </p>
        <p className="text-sm text-muted-foreground">
          Give it a minute, then reload this page.
        </p>
      </div>
    );
  }

  const page = await getPublicStudioPage(slug);
  if (!page) notFound();

  const place = [page.city, page.country].filter(Boolean).join(", ");
  const url = `${SITE_URL}/studios/${slug}`;
  // sameAs carries ONLY what this page visibly renders. The studio's stored
  // social link is deliberately excluded: for a claimed seed it is whatever
  // the claimant submitted as evidence (often a personal profile), it is not
  // shown anywhere, and the owner has no surface to review or remove it.
  // Structured data must never publish something the page does not show.
  const sameAs = [
    page.website,
    page.instagram ? `https://instagram.com/${page.instagram}` : null,
  ].filter((v): v is string => Boolean(v));

  // Entity markup only for gate-passing pages: a noindex page emits no
  // business schema at all.
  const schemas = page.indexability.indexable
    ? [
        webPageSchema({
          name: page.name,
          url,
          description: page.description ?? page.name,
        }),
        localBusinessSchema({
          name: page.name,
          url,
          description: page.description,
          city: page.city,
          country: page.country,
          streetAddress: page.streetAddress,
          geo: page.geo,
          images: page.photoUrls.map((p) => `${SITE_URL}${p}`),
          sameAs,
        }),
        breadcrumbListSchema([
          { name: "Tattoo map", url: `${SITE_URL}/map` },
          { name: page.name, url },
        ]),
      ]
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          aria-label="Go to the inklee homepage"
          className="inline-flex items-center"
        >
          <RandomizedLogo height={18} />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/login?next=${encodeURIComponent(`/studios/${slug}`)}`}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90"
          >
            Create account
          </Link>
        </div>
      </div>

      <header className="space-y-2">
        {page.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.logoUrl}
            alt={`${page.name} logo`}
            width={64}
            height={64}
            className="h-16 w-16 rounded-2xl border border-border object-cover"
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {page.name}
          </h1>
          <span className="rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs text-brand-mustard">
            Claimed
          </span>
        </div>
        {place ? (
          <p className="text-sm text-muted-foreground">{place}</p>
        ) : null}
        {page.lastConfirmedAt ? (
          <p className="text-xs text-muted-foreground">
            Confirmed by the studio on{" "}
            {formatDateKey(page.lastConfirmedAt.slice(0, 10))}.
          </p>
        ) : null}
      </header>

      {page.description || page.vibe ? (
        <section className="space-y-2">
          {page.description ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {page.description}
            </p>
          ) : null}
          {page.vibe ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {page.vibe}
            </p>
          ) : null}
        </section>
      ) : null}

      {page.photoUrls.length > 0 ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {page.photoUrls.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={`${page.name} studio photo ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              className="aspect-square w-full rounded-xl border border-border object-cover"
            />
          ))}
        </section>
      ) : null}

      <Section title="Where">
        <p className="text-sm text-foreground">
          {[page.streetAddress, place].filter(Boolean).join(", ") ||
            "Location shared by the studio."}
        </p>
        {page.streetAddress ? null : (
          <p className="text-xs text-muted-foreground">
            This studio shows its area only. Get in touch for the exact address.
          </p>
        )}
        <Link
          href={`/map?sel=${encodeURIComponent(page.mapLocationId)}`}
          className="inline-block text-xs text-foreground underline underline-offset-2"
        >
          See it on the tattoo map
        </Link>
      </Section>

      {page.styles && !page.styles.isEmpty ? (
        <Section title="Styles represented">
          {page.styles.specialties.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {page.styles.specialties.map((s) => (
                <span
                  key={s.key}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                >
                  {s.label}
                </span>
              ))}
            </div>
          ) : null}
          {page.styles.guestStyles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {page.styles.guestStyles.map((s) => (
                <span
                  key={s.key}
                  className="rounded-full bg-brand-rosa/15 px-2.5 py-1 text-xs text-foreground"
                >
                  {s.label}
                  {s.showCount ? ` · ${s.count} visiting` : " · guest"}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Styles reflect what the studio declares and the guest artists
            visiting it. Not every artist works in every style.
          </p>
        </Section>
      ) : null}

      {page.categories.length > 0 ? (
        <Section title="Studio">
          <div className="flex flex-wrap gap-1.5">
            {page.categories.map((c, i) => (
              <span
                key={`${c.label}-${i}`}
                className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
              >
                {c.label}
              </span>
            ))}
          </div>
        </Section>
      ) : null}

      {page.houseRules.length > 0 ? (
        <Section title="House rules">
          <ul className="space-y-2">
            {page.houseRules.map((rule) => (
              <li key={rule.key} className="text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {HOUSE_RULE_LABELS[rule.key as HouseRuleKey] ?? rule.key}
                </p>
                <p className="whitespace-pre-wrap text-foreground">
                  {rule.content}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {page.timeline &&
      (page.timeline.current.length > 0 ||
        page.timeline.upcoming.length > 0 ||
        page.timeline.past.length > 0) ? (
        <Section title="Guest artists">
          {(
            [
              ["Now", page.timeline.current],
              ["Coming up", page.timeline.upcoming],
              ["Past", page.timeline.past],
            ] as const
          )
            .filter(([, entries]) => entries.length > 0)
            .map(([heading, entries]) => (
              <div key={heading} className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {heading}
                </p>
                <ul className="space-y-1">
                  {entries.map((entry, i) => (
                    <li
                      key={`${heading}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-foreground">
                        {entry.name ?? "A guest artist"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.startsOn === entry.endsOn
                          ? formatDateKey(entry.startsOn)
                          : `${formatDateKey(entry.startsOn)} to ${formatDateKey(entry.endsOn)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </Section>
      ) : null}

      {sameAs.length > 0 ? (
        <Section title="Find the studio">
          <div className="flex flex-wrap gap-2">
            {page.website ? (
              <a
                href={page.website}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
              >
                Website
              </a>
            ) : null}
            {page.instagram ? (
              <a
                href={`https://instagram.com/${encodeURIComponent(page.instagram)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
              >
                @{page.instagram}
              </a>
            ) : null}
          </div>
        </Section>
      ) : null}

      {page.guestSpotStatus === "accepting" ? (
        <div className="space-y-2 rounded-2xl border border-border p-4">
          <p className="text-sm text-foreground">
            This studio takes guest spot requests.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/map/${page.mapLocationId}/request`)}`}
            className="inline-block rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90"
          >
            Sign in to request a guest spot
          </Link>
        </div>
      ) : null}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        {STUDIO_DATA_CREDIT}{" "}
        <Link
          href={DATA_ATTRIBUTION_PATH}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {DATA_ATTRIBUTION_LINK_LABEL}
        </Link>
      </p>
    </div>
  );
}
