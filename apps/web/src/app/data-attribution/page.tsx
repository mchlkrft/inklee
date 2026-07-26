import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/json-ld";
import { webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";
import { publicMapEnabled } from "@/lib/map-features";
import { getVendoredLicenses } from "@/lib/licenses";
import {
  DIRECTORY_SOURCES,
  FOURSQUARE_NOTICE,
  MODIFICATION_SINCE,
  NEVER_PUBLISHED_FROM_SOURCES,
  PUBLISHED_SEED_FIELDS,
  STUDIO_DATA_CREDIT,
} from "@inklee/shared/map-attribution";

/**
 * Public transparency page for the tattoo map's studio data. It carries two
 * separate obligations that counsel put on one page:
 *
 *  1. Open-data licensing (counsel note 2026-07-22 §7.3, corrected 2026-07-26):
 *     the studio-data credit, the licences behind it, the Foursquare NOTICE,
 *     and the Apache-2.0 statement that rows were changed, with a date.
 *  2. GDPR for seeded studios that are sole traders trading under a personal
 *     name (§7.7): the Art. 14 disclosure, since the data was not obtained from
 *     the data subject, plus a working Art. 21 objection and delisting route.
 *     Publishing this page is what makes the Art. 14(5)(b) disproportionate
 *     effort route available for open-data seeding.
 *
 * GATED on publicMapEnabled() and 404s otherwise, the same fail-closed shape
 * /pricing uses: while the map is authenticated-only there are no publicly
 * listed studios, so a public page describing them would be inaccurate.
 *
 * BEFORE THE FLIP: vendor verbatim copies of the CDLA-Permissive-2.0 and
 * Apache-2.0 texts and serve them from this page. Apache-2.0 section 4(a)
 * requires giving recipients a copy of the licence; the canonical links below
 * are the interim position. The copies must be downloaded, never transcribed.
 *
 * ODbL is deliberately NOT in that list: counsel confirmed 2026-07-26 that a
 * Produced Work owes attribution plus an indication of the licence, which the
 * credit line and its link already discharge. Two licence texts to vendor, not
 * three.
 */

const PAGE_PATH = "/data-attribution";
const PAGE_TITLE = "Studio data, licences and how to be removed · Inklee";
const PAGE_DESCRIPTION =
  "Where the studio entries on the Inklee tattoo map come from, the open-data licences behind them, and how a studio can correct its entry or ask to be removed.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  // Fail-closed like every other pre-launch surface. At the public flip,
  // reconsider indexing: a data subject looking for "why am I on this map"
  // should be able to find this page.
  robots: { index: false, follow: true },
  openGraph: {
    title: "Studio data on the Inklee tattoo map",
    description: PAGE_DESCRIPTION,
    url: absoluteUrl(PAGE_PATH),
    type: "website",
  },
};

export default function DataAttributionPage() {
  if (!publicMapEnabled()) notFound();

  const licenses = getVendoredLicenses();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <JsonLd
        data={webPageSchema({
          name: PAGE_TITLE,
          url: absoluteUrl(PAGE_PATH),
          description: PAGE_DESCRIPTION,
        })}
        id="ld-webpage"
      />
      <PillNav />
      <main className="flex-1">
        {/* Hero (charcoal) */}
        <section className="border-b border-shell-border">
          <div className="container-marketing py-20 md:py-28">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Studio data
              </p>
              <h1 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                Where the studios
                <br />
                on the map come from.
              </h1>
              <p className="mt-6 text-base leading-relaxed text-shell-fg-dim md:text-lg">
                The Inklee tattoo map is built from open data plus entries our
                admins add and review by hand. This page names the sources,
                carries their licences, and explains how a studio can correct
                its entry or ask to be taken off the map.
              </p>
            </div>
          </div>
        </section>

        {/* The credit (bone) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                Attribution
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight md:text-4xl">
                The credit we carry.
              </h2>
              {/* Rendered from the same constant the map overlay uses, so the
                  approved wording can never drift between the two surfaces. */}
              <div className="mt-6 rounded-3xl bg-[#d9d4c7] p-6 md:p-7">
                <p className="text-base leading-relaxed text-brand-charcoal md:text-lg">
                  {STUDIO_DATA_CREDIT}
                </p>
              </div>
              <p className="mt-3 text-sm text-brand-charcoal/60">
                This is the exact credit shown on the map, rendered here from
                the same source.
              </p>
              <p className="mt-6 text-base leading-relaxed text-brand-charcoal/75">
                This credit appears on the map and on every public studio page.
                It is separate from the credit for the map background, which
                names MapLibre, CARTO and OpenStreetMap contributors and sits on
                the map itself.
              </p>

              <h3 className="mt-10 text-xl font-black leading-tight text-brand-charcoal">
                Required notices
              </h3>
              <dl className="mt-4 space-y-4">
                <div className="rounded-2xl border-[1.5px] border-brand-charcoal/15 p-5">
                  <dt className="text-sm font-bold text-brand-charcoal">
                    Foursquare notice
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-brand-charcoal/75">
                    {FOURSQUARE_NOTICE}
                  </dd>
                </div>
                <div className="rounded-2xl border-[1.5px] border-brand-charcoal/15 p-5">
                  <dt className="text-sm font-bold text-brand-charcoal">
                    Statement of changes
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-brand-charcoal/75">
                    Entries derived from these sources have been modified by
                    Inklee, on an ongoing basis since {MODIFICATION_SINCE}. Our
                    admins review, correct, merge, categorise and remove
                    entries, and studio owners edit their own once they claim
                    them.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* Sources (charcoal) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-20 md:py-28">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Sources
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight text-shell-fg md:text-4xl">
                Three open-data sources.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-shell-fg-dim">
                Every seeded entry is traceable to the source it came from, so
                we can credit it and remove it. Entries created by our admins or
                by a studio owner are not derived from these sources at all.
              </p>
            </div>
            <div className="mt-10 space-y-4 md:space-y-5">
              {DIRECTORY_SOURCES.map((source) => (
                <div
                  key={source.key}
                  className="rounded-3xl border-[1.5px] border-shell-border bg-[#252525] p-6 md:p-7"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h3 className="text-lg font-black leading-tight text-shell-fg md:text-xl">
                      {source.name}
                    </h3>
                    <a
                      href={source.licenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-bold text-brand-mustard underline-offset-4 hover:underline"
                    >
                      {source.licence}
                    </a>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-shell-fg-dim">
                    {source.taken}
                  </p>
                  <a
                    href={source.homeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm text-shell-fg-dim underline underline-offset-4 hover:text-shell-fg"
                  >
                    About this source
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why you are listed (bone) — GDPR Art. 14 */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                For studio owners
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight md:text-4xl">
                Why your studio is on the map.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                We did not get this information from you. It came from the open
                sources above, and we added your studio so that tattoo artists
                looking for a place to work a guest spot can find it. You never
                had to sign up, and you do not need an Inklee account for your
                entry to exist.
              </p>

              <h3 className="mt-10 text-xl font-black leading-tight">
                What we publish about a studio we listed
              </h3>
              <ul className="mt-4 space-y-2">
                {PUBLISHED_SEED_FIELDS.map((field) => (
                  <li
                    key={field}
                    className="flex gap-3 text-base leading-relaxed text-brand-charcoal/75"
                  >
                    <span aria-hidden="true" className="text-brand-charcoal/40">
                      •
                    </span>
                    <span>{field}</span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-10 text-xl font-black leading-tight">
                What we never take from a source
              </h3>
              <ul className="mt-4 space-y-2">
                {NEVER_PUBLISHED_FROM_SOURCES.map((field) => (
                  <li
                    key={field}
                    className="flex gap-3 text-base leading-relaxed text-brand-charcoal/75"
                  >
                    <span aria-hidden="true" className="text-brand-charcoal/40">
                      •
                    </span>
                    <span>{field}</span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-10 text-xl font-black leading-tight">
                Our basis for listing you
              </h3>
              <p className="mt-4 text-base leading-relaxed text-brand-charcoal/75">
                We rely on legitimate interests under Article 6(1)(f) of the
                GDPR: a directory of tattoo studios is useful to travelling
                artists, and publishing a business name and location is a
                limited intrusion on a business that is already publicly listed.
                If your studio trades under your personal name, that entry is
                personal data and the rights below apply to it. You can object
                at any time, and we will remove the entry.
              </p>
              <p className="mt-4 text-base leading-relaxed text-brand-charcoal/75">
                We keep a record of where each entry came from so we can credit
                the source and act on a removal request. Our full privacy notice
                is at{" "}
                <Link
                  href="/privacy"
                  className="font-bold text-brand-charcoal underline underline-offset-4"
                >
                  inklee.app/privacy
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Correct or remove (charcoal) — GDPR Art. 21 route */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-20 md:py-28">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Your options
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight text-shell-fg md:text-4xl">
                Correct it, claim it,
                <br />
                or have it removed.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-shell-fg-dim md:text-lg">
                Any of these is fine, and none of them requires you to keep an
                Inklee account afterwards.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              <div className="rounded-3xl bg-brand-mustard p-6 md:p-7">
                <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                  Correct it
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-charcoal/75">
                  Open your studio on the map and use the report link to tell us
                  what is wrong. You do not need to prove anything, and we
                  review every report by hand.
                </p>
              </div>
              <div className="rounded-3xl bg-brand-bone p-6 md:p-7">
                <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                  Claim it
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-charcoal/75">
                  If you run the studio, claim the entry and you control what it
                  says: details, styles, house rules, and whether you host guest
                  artists.
                </p>
              </div>
              <div className="rounded-3xl bg-brand-rosa p-6 md:p-7">
                <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                  Have it removed
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-charcoal/75">
                  Tell us to take the entry down and we will. You do not have to
                  give a reason, and we do not put removed studios back.
                </p>
              </div>
            </div>
            <div className="mt-10 max-w-3xl rounded-3xl border-[1.5px] border-shell-border bg-[#252525] p-6 md:p-7">
              <h3 className="text-lg font-black leading-tight text-shell-fg">
                How to reach us
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-shell-fg-dim">
                Email{" "}
                <a
                  href="mailto:support@inklee.app"
                  className="font-bold text-shell-fg underline underline-offset-4"
                >
                  support@inklee.app
                </a>{" "}
                with the studio name and city, or use the{" "}
                <Link
                  href="/legal/report"
                  className="font-bold text-shell-fg underline underline-offset-4"
                >
                  report form
                </Link>
                . Say that you want the entry corrected or removed. We answer
                within a few days, and we do not need you to create an account
                to act on it.
              </p>
            </div>
          </div>
        </section>

        {/* Licence texts (bone). Last on the page on purpose: notices and
            rights first, the legal appendix at the bottom, and it keeps the
            page's charcoal/bone alternation intact.

            Apache-2.0 section 4(a) wants recipients given a copy of the
            licence, and CDLA-Permissive-2.0 section 2.1 wants the agreement
            text made available with shared Data. Both are served verbatim from
            content/licenses/, downloaded from the canonical source. ODbL is not
            here on counsel's confirmation: attribution plus an indication of
            the licence is what a Produced Work owes. */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                Licence texts
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight md:text-4xl">
                The full licences.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-brand-charcoal/75">
                Reproduced in full, exactly as published. The OpenStreetMap data
                is covered by the ODbL, linked in the source list above.
              </p>
            </div>
            <div className="mt-10 space-y-5">
              {licenses.map((license) => (
                <details
                  key={license.id}
                  className="group rounded-3xl border-[1.5px] border-brand-charcoal/15 bg-[#d9d4c7] p-6 md:p-7"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                      {license.title}
                    </h3>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-2xl font-black text-brand-charcoal/60 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  {/* overflow-x-auto so a pre-formatted licence can never push
                      the page into a horizontal scroll on a phone. */}
                  <div className="mt-5 overflow-x-auto">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-charcoal/80">
                      {license.text}
                    </pre>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
