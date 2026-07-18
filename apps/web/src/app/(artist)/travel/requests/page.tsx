import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled } from "@/lib/map-features";
import { listArtistRequests } from "@/lib/server/guest-spots";
import {
  GUEST_SPOT_OPEN_STATUSES,
  guestSpotRequestStatusLabel,
} from "@inklee/shared/guest-spots";
import { formatDateKey } from "@inklee/shared/date-utils";

export const metadata: Metadata = {
  title: "Guest spot requests",
  robots: { index: false, follow: false },
};

function range(start: string, end: string) {
  if (start === end) return formatDateKey(start);
  return `${formatDateKey(start)} – ${formatDateKey(end)}`;
}

export default async function ArtistRequestsPage() {
  if (!tattooMapEnabled()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const requests = await listArtistRequests(user.id);
  // Confirmed upcoming stays belong with the live requests, not under Past.
  const activeSet = new Set<string>([...GUEST_SPOT_OPEN_STATUSES, "confirmed"]);
  const open = requests.filter((r) => activeSet.has(r.status));
  const done = requests.filter((r) => !activeSet.has(r.status));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/travel"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Guest Spots
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">
          Guest spot requests
        </h1>
        <p className="text-sm text-muted-foreground">
          Requests you sent to studios on the tattoo map.
        </p>
      </header>

      {requests.length === 0 ? (
        <div className="space-y-2 rounded-2xl border border-border p-5">
          <p className="text-sm text-foreground">
            No requests yet. Find a studio on the map and ask for a guest spot.
          </p>
          <Link
            href="/map"
            className="inline-block rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90"
          >
            Open the map
          </Link>
        </div>
      ) : (
        <>
          {open.length > 0 ? (
            <ul className="space-y-2">
              {open.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/travel/requests/${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-4 transition-colors hover:bg-muted/30"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">
                        {r.studioName}
                        {r.studioCity ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {r.studioCity}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {range(r.startDate, r.endDate)}
                      </span>
                    </span>
                    <span className="rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs text-brand-mustard">
                      {guestSpotRequestStatusLabel(r.status)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {done.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Past</h2>
              <ul className="space-y-2">
                {done.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/travel/requests/${r.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-4 opacity-80 transition-colors hover:bg-muted/30"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">
                          {r.studioName}
                          {r.studioCity ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {r.studioCity}
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {range(r.startDate, r.endDate)}
                        </span>
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {guestSpotRequestStatusLabel(r.status)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
