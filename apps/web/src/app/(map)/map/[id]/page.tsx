import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled, publicMapEnabled } from "@/lib/map-features";
import { getClientIp } from "@/lib/get-client-ip";
import { checkPublicMapDetailRateLimit } from "@/lib/ratelimit";
import RandomizedLogo from "@/components/randomized-logo";
import {
  STUDIO_DATA_CREDIT,
  DATA_ATTRIBUTION_PATH,
  DATA_ATTRIBUTION_LINK_LABEL,
} from "@inklee/shared/map-attribution";
import { MAP_LOCATION_CATEGORY_LABELS } from "@inklee/shared/map-directory";
import {
  HOUSE_RULE_LABELS,
  type HouseRuleKey,
} from "@inklee/shared/studio-profile";
import {
  STUDIO_SIGNAL_LABELS,
  isStudioSignalType,
} from "@inklee/shared/studio-signals";
import { formatDateKey } from "@inklee/shared/date-utils";
import type { TimelineEntry } from "@inklee/shared/map-location-detail";
import {
  getMapLocationDetail,
  getPublicMapLocationDetail,
  type MapLocationDetailShared,
} from "@/lib/server/map-location-detail";
import WatchButton from "./watch-button";
import ReportIssue from "./report-issue";

// The studio's full page, auth-optional since go-live plan S2 and refactored
// onto the ONE detail read-model (it used to duplicate the queries inline).
// Signed-in artists get the pre-S2 page (watch, report, request); anonymous
// visitors get the viewer-independent payload with sign-in walls that carry
// the intended action as a return target. Anonymous access exists only while
// publicMapEnabled() is on; otherwise the pre-S2 login redirect stands.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // noindex per the ratified SEO strategy (unclaimed entries are never
  // indexable and the in-map entity URL is not the canonical studio page);
  // follow + self-canonical so the crawl path stays clean.
  return {
    robots: { index: false, follow: true },
    alternates: { canonical: `/map/${id}` },
  };
}

export default async function MapLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!tattooMapEnabled()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !publicMapEnabled()) redirect("/login");
  const { id } = await params;

  // The anonymous SSR read carries the SAME abuse control as its API twin
  // (S1 invariant: the auth gate's replacement is the per-IP limiter;
  // refuse-before-work, fail-closed without Redis in production). Without
  // this, the page route would be an unmetered anonymous path to the
  // database that ignores the API budgets entirely.
  if (!user) {
    const { allowed } = await checkPublicMapDetailRateLimit(
      getClientIp(await headers()),
    );
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
  }

  // Approved rows only; everything else is invisible (fail closed). The
  // authed branch composes the viewer decoration (watched, ownStudio); the
  // anonymous branch structurally cannot carry it.
  let shared: MapLocationDetailShared | null = null;
  let viewer: { watched: boolean; ownStudio: boolean } | null = null;
  if (user) {
    const detail = await getMapLocationDetail(id, user.id);
    if (detail) {
      shared = detail;
      viewer = { watched: detail.watched, ownStudio: detail.ownStudio };
    }
  } else {
    shared = await getPublicMapLocationDetail(id);
  }
  if (!shared) notFound();

  const signInTo = (next: string) => `/login?next=${encodeURIComponent(next)}`;

  const categoryLabel =
    MAP_LOCATION_CATEGORY_LABELS[
      shared.category as keyof typeof MAP_LOCATION_CATEGORY_LABELS
    ] ?? shared.category;
  const place = [shared.address, shared.city, shared.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      {/* Anonymous visitors get the minimal public chrome the (map) layout
          deliberately does not provide: a way home, a way in, and the
          experimental framing. Signed-in artists have the full workspace
          chrome from the layout instead. */}
      {viewer ? null : (
        <div className="space-y-2">
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
                href={signInTo(`/map/${id}`)}
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
          <p className="text-xs text-muted-foreground">
            An experimental map. It grows and improves with the community.
          </p>
        </div>
      )}
      <header className="space-y-1">
        <Link
          href="/map"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Tattoo map
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {shared.name}
          </h1>
          {shared.claimed ? (
            <span className="rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs text-brand-mustard">
              Claimed
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Unclaimed
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{categoryLabel}</p>
        {shared.claimed && shared.lastConfirmedAt ? (
          <p className="text-xs text-muted-foreground">
            Confirmed by the studio on{" "}
            {formatDateKey(shared.lastConfirmedAt.slice(0, 10))}.
          </p>
        ) : null}
      </header>

      {shared.possiblyClosed ? (
        <section className="rounded-2xl border border-brand-red/40 bg-brand-red/10 p-4">
          <p className="text-sm font-medium text-foreground">Possibly closed</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Someone reported this studio may have closed. Details may be out of
            date. If it is open, claim it or report the listing to set it
            straight.
          </p>
        </section>
      ) : null}

      {shared.unverified ? (
        <section className="rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-sm text-foreground">
            Unverified listing. We compiled this from public map data, so the
            address and details may be out of date.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            If it is your studio, claim it below to keep it accurate. Otherwise
            you can report an issue at the bottom.
          </p>
        </section>
      ) : null}

      {shared.signal && isStudioSignalType(shared.signal) ? (
        <section className="rounded-2xl border border-brand-rosa/40 bg-brand-rosa/10 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Right now
          </p>
          <p className="text-sm font-medium text-foreground">
            {STUDIO_SIGNAL_LABELS[shared.signal]}
          </p>
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-border p-4">
        {place ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Where
            </p>
            <p className="text-sm text-foreground">{place}</p>
          </div>
        ) : null}
        {shared.openingHours ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Opening hours
            </p>
            <p className="text-sm text-foreground">{shared.openingHours}</p>
          </div>
        ) : null}
        {shared.phone ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Phone
            </p>
            <a
              href={`tel:${shared.phone.replace(/[^\d+]/g, "")}`}
              className="text-sm text-foreground underline-offset-2 hover:underline"
            >
              {shared.phone}
            </a>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {shared.website ? (
            <a
              href={shared.website}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              Website
            </a>
          ) : null}
          {shared.instagram ? (
            <a
              href={`https://instagram.com/${encodeURIComponent(shared.instagram)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              @{shared.instagram}
            </a>
          ) : null}
          {viewer ? (
            <WatchButton mapLocationId={id} initialWatched={viewer.watched} />
          ) : (
            <Link
              href={signInTo(`/map/${id}`)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              Sign in to watch
            </Link>
          )}
        </div>
      </section>

      {shared.claimed && shared.styles && !shared.styles.isEmpty ? (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Styles represented
          </h2>
          {shared.styles.specialties.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Studio specialties
              </p>
              <div className="flex flex-wrap gap-1.5">
                {shared.styles.specialties.map((s) => (
                  <span
                    key={s.key}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {shared.styles.guestStyles.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Guest artist styles
              </p>
              <div className="flex flex-wrap gap-1.5">
                {shared.styles.guestStyles.map((s) => (
                  <span
                    key={s.key}
                    className="rounded-full bg-brand-rosa/15 px-2.5 py-1 text-xs text-foreground"
                  >
                    {s.label}
                    {s.showCount
                      ? ` · ${s.count} visiting`
                      : " · guest visiting"}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Styles reflect what the studio declares and the guest artists
            visiting it. Not every artist works in every style.
          </p>
        </section>
      ) : null}

      {shared.claimed &&
      shared.timeline &&
      (shared.timeline.current.length > 0 ||
        shared.timeline.upcoming.length > 0 ||
        shared.timeline.past.length > 0) ? (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Guest artists
          </h2>
          {(
            [
              ["Now", shared.timeline.current],
              ["Coming up", shared.timeline.upcoming],
              ["Past", shared.timeline.past],
            ] as Array<[string, TimelineEntry[]]>
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
                      {entry.name && entry.slug ? (
                        <a
                          href={`/${entry.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground underline-offset-2 hover:underline"
                        >
                          {entry.name}
                        </a>
                      ) : (
                        <span className="text-foreground">
                          {entry.name ?? "A guest artist"}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {entry.startsOn === entry.endsOn
                          ? formatDateKey(entry.startsOn)
                          : `${formatDateKey(entry.startsOn)} – ${formatDateKey(entry.endsOn)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>
      ) : null}

      {shared.claimed && shared.houseRules.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">House rules</h2>
          <ul className="space-y-2">
            {shared.houseRules.map((rule) => (
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
        </section>
      ) : null}

      {shared.claimed ? (
        shared.requestable && !viewer?.ownStudio ? (
          <div className="space-y-2 rounded-2xl border border-border p-4">
            <p className="text-sm text-foreground">
              This studio takes guest spot requests.
            </p>
            {viewer ? (
              <Link
                href={`/map/${id}/request`}
                className="inline-block rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90"
              >
                Request a guest spot
              </Link>
            ) : (
              <Link
                href={signInTo(`/map/${id}/request`)}
                className="inline-block rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90"
              >
                Sign in to request a guest spot
              </Link>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This place manages its own page.
          </p>
        )
      ) : shared.category === "supply_shop" ? (
        <p className="text-xs text-muted-foreground">
          Nobody runs this page yet.
        </p>
      ) : (
        <div className="space-y-2 rounded-2xl border border-border p-4">
          <p className="text-sm text-foreground">
            Your studio? Claim the page and run it yourself, including guest
            spot requests from travelling artists.
          </p>
          <Link
            href={
              viewer ? `/studio/claim/${id}` : signInTo(`/studio/claim/${id}`)
            }
            className="inline-block rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
          >
            Claim this studio
          </Link>
        </div>
      )}

      {shared.claimed ? null : viewer ? (
        <div className="pt-1">
          <ReportIssue mapLocationId={id} />
        </div>
      ) : (
        <p className="pt-1 text-xs text-muted-foreground">
          Something wrong with this listing? You can{" "}
          <Link
            href="/legal/report"
            className="text-foreground underline underline-offset-2"
          >
            report it here
          </Link>
          , or{" "}
          <Link
            href={signInTo(`/map/${id}`)}
            className="text-foreground underline underline-offset-2"
          >
            sign in
          </Link>{" "}
          to suggest a correction on the listing itself.
        </p>
      )}

      {/* The studio-data credit (counsel-approved wording, verbatim) on the
          anonymous entity surface; signed-in artists see it on the map pill. */}
      {viewer ? null : (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {STUDIO_DATA_CREDIT}{" "}
          <Link
            href={DATA_ATTRIBUTION_PATH}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {DATA_ATTRIBUTION_LINK_LABEL}
          </Link>
        </p>
      )}
    </div>
  );
}
