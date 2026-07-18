import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import { MAP_LOCATION_CATEGORY_LABELS } from "@inklee/shared/map-directory";
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
      "id, name, category, address, city, country, website_url, instagram_handle, claim_status, moderation_status, last_confirmed_at",
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

      <section className="space-y-3 rounded-2xl border border-border p-4">
        {place ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Where
            </p>
            <p className="text-sm text-foreground">{place}</p>
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

      {claimed ? (
        <p className="text-xs text-muted-foreground">
          This place manages its own page.
        </p>
      ) : data.category === "supply_shop" ? (
        <p className="text-xs text-muted-foreground">
          Nobody runs this page yet.
        </p>
      ) : (
        <div className="space-y-2 rounded-2xl border border-border p-4">
          <p className="text-sm text-foreground">
            Your studio? Claim the page and run it yourself. Guest spot requests
            follow in a later update.
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
