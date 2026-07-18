import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled } from "@/lib/map-features";
import { listStudioInbox, listStudioStays } from "@/lib/server/guest-spots";
import { guestSpotRequestStatusLabel } from "@inklee/shared/guest-spots";
import { formatDateKey } from "@inklee/shared/date-utils";
import StayCancelButton from "./stay-cancel-button";

export const metadata: Metadata = {
  title: "Guest spot requests",
  robots: { index: false, follow: false },
};

function range(start: string, end: string) {
  if (start === end) return formatDateKey(start);
  return `${formatDateKey(start)} – ${formatDateKey(end)}`;
}

function RequestRow({
  r,
}: {
  r: {
    id: string;
    artistName: string;
    startDate: string;
    endDate: string;
    status: string;
  };
}) {
  return (
    <Link
      href={`/studio/requests/${r.id}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-4 transition-colors hover:bg-muted/30"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground">
          {r.artistName}
        </span>
        <span className="block text-xs text-muted-foreground">
          {range(r.startDate, r.endDate)}
        </span>
      </span>
      <span className="rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs text-brand-mustard">
        {guestSpotRequestStatusLabel(r.status)}
      </span>
    </Link>
  );
}

export default async function StudioRequestsPage() {
  if (!tattooMapEnabled()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [inbox, stays] = await Promise.all([
    listStudioInbox(user.id),
    listStudioStays(user.id),
  ]);
  if (!inbox) redirect("/studio");

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (stays ?? []).filter(
    (s) =>
      (s.status === "confirmed" || s.status === "active") && s.endsOn >= today,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/studio"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Studio
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">
          Guest spot requests
        </h1>
        <p className="text-sm text-muted-foreground">
          Artists who want to work from your studio.
        </p>
      </header>

      {inbox.open.length === 0 ? (
        <div className="rounded-2xl border border-border p-5">
          <p className="text-sm text-foreground">
            No open requests right now. Artists find you through the tattoo map;
            keep your page fresh so they know what to expect.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {inbox.open.map((r) => (
            <li key={r.id}>
              <RequestRow r={r} />
            </li>
          ))}
        </ul>
      )}

      {inbox.blocked.length > 0 ? (
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Blocked artists ({inbox.blocked.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {inbox.blocked.map((r) => (
              <li key={r.id}>
                <RequestRow r={r} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            Upcoming guests
          </h2>
          <ul className="space-y-2">
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-4"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">
                    {s.artistName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {range(s.startsOn, s.endsOn)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {s.artistSlug ? (
                    <a
                      href={`/${s.artistSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
                    >
                      View page
                    </a>
                  ) : null}
                  <StayCancelButton stayId={s.id} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
