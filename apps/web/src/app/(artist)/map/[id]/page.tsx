import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import { MAP_LOCATION_CATEGORY_LABELS } from "@inklee/shared/map-directory";
import {
  HOUSE_RULE_LABELS,
  type HouseRuleKey,
} from "@inklee/shared/studio-profile";
import { getPublishedHouseRules } from "@/lib/server/studios";
import {
  getStudioGuestTimeline,
  type StudioTimeline,
  type TimelineEntry,
} from "@/lib/server/guest-spots";
import { activeSignalsByLocation } from "@/lib/server/studio-signals";
import {
  STUDIO_SIGNAL_LABELS,
  isStudioSignalType,
} from "@inklee/shared/studio-signals";
import { formatDateKey } from "@inklee/shared/date-utils";
import WatchButton from "./watch-button";

// Logged-in only and noindex by default (open question Q3 keeps seeded pages
// out of search until decided otherwise).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
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
  if (!user) redirect("/login");
  const { id } = await params;

  // Approved rows only; everything else is invisible (fail closed).
  const { data } = await serviceClient
    .from("map_locations")
    .select(
      "id, name, category, address, city, country, website_url, instagram_handle, phone, opening_hours, claim_status, moderation_status, last_confirmed_at",
    )
    .eq("id", id)
    .eq("moderation_status", "approved")
    .maybeSingle();
  if (!data) notFound();

  const { data: watch } = await supabase
    .from("watched_studios")
    .select("id")
    .eq("map_location_id", id)
    .eq("artist_user_id", user.id)
    .maybeSingle();

  // Claimed + published studios can receive guest spot requests.
  const { data: studioLink } = await serviceClient
    .from("map_locations")
    .select("studio_profile_id")
    .eq("id", id)
    .maybeSingle();
  let requestable = false;
  let ownStudio = false;
  let houseRules: Array<{ key: string; content: string }> = [];
  let timeline: StudioTimeline | null = null;
  if (studioLink?.studio_profile_id) {
    const { data: studio } = await serviceClient
      .from("studio_profiles")
      .select("owner_user_id, publication_status, guest_spot_status")
      .eq("id", studioLink.studio_profile_id as string)
      .maybeSingle();
    // invitation_only stays un-requestable: the setting exists to stop
    // unsolicited requests.
    requestable =
      studio?.publication_status === "published" &&
      studio.guest_spot_status === "accepting";
    ownStudio = studio?.owner_user_id === user.id;
    if (studio?.publication_status === "published") {
      [houseRules, timeline] = await Promise.all([
        getPublishedHouseRules(studioLink.studio_profile_id as string),
        getStudioGuestTimeline(studioLink.studio_profile_id as string),
      ]);
    }
  }

  const signals = await activeSignalsByLocation([id]);
  const activeSignal = signals.get(id) ?? null;

  const categoryLabel =
    MAP_LOCATION_CATEGORY_LABELS[
      data.category as keyof typeof MAP_LOCATION_CATEGORY_LABELS
    ] ?? (data.category as string);
  const website = safeHttpUrl(data.website_url as string | null);
  const instagram = data.instagram_handle as string | null;
  const claimed = (data.claim_status as string) === "claimed";
  const place = [data.address, data.city, data.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/map"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Tattoo map
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {data.name as string}
          </h1>
          {claimed ? (
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
      </header>

      {activeSignal && isStudioSignalType(activeSignal) ? (
        <section className="rounded-2xl border border-brand-rosa/40 bg-brand-rosa/10 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Right now
          </p>
          <p className="text-sm font-medium text-foreground">
            {STUDIO_SIGNAL_LABELS[activeSignal]}
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
        {(data.opening_hours as string | null) ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Opening hours
            </p>
            <p className="text-sm text-foreground">
              {data.opening_hours as string}
            </p>
          </div>
        ) : null}
        {(data.phone as string | null) ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Phone
            </p>
            <a
              href={`tel:${(data.phone as string).replace(/[^\d+]/g, "")}`}
              className="text-sm text-foreground underline-offset-2 hover:underline"
            >
              {data.phone as string}
            </a>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {website ? (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              Website
            </a>
          ) : null}
          {instagram ? (
            <a
              href={`https://instagram.com/${encodeURIComponent(instagram)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              @{instagram}
            </a>
          ) : null}
          <WatchButton mapLocationId={id} initialWatched={Boolean(watch)} />
        </div>
      </section>

      {claimed &&
      timeline &&
      (timeline.current.length > 0 ||
        timeline.upcoming.length > 0 ||
        timeline.past.length > 0) ? (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Guest artists
          </h2>
          {(
            [
              ["Now", timeline.current],
              ["Coming up", timeline.upcoming],
              ["Past", timeline.past],
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

      {claimed && houseRules.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">House rules</h2>
          <ul className="space-y-2">
            {houseRules.map((rule) => (
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

      {claimed ? (
        requestable && !ownStudio ? (
          <div className="space-y-2 rounded-2xl border border-border p-4">
            <p className="text-sm text-foreground">
              This studio takes guest spot requests.
            </p>
            <Link
              href={`/map/${id}/request`}
              className="inline-block rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90"
            >
              Request a guest spot
            </Link>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This place manages its own page.
          </p>
        )
      ) : data.category === "supply_shop" ? (
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
            href={`/studio/claim/${id}`}
            className="inline-block rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
          >
            Claim this studio
          </Link>
        </div>
      )}
    </div>
  );
}
