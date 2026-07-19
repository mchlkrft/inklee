import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled } from "@/lib/map-features";
import { getOwnClaims, getOwnedStudio } from "@/lib/server/studios";
import { listStudioInbox, listStudioStays } from "@/lib/server/guest-spots";
import { formatDateKey } from "@inklee/shared/date-utils";
import {
  CLAIM_STATUS_LABELS,
  GUEST_SPOT_STATUS_LABELS,
  type GuestSpotStatus,
} from "@inklee/shared/studio-profile";
import PublishControls from "./publish-controls";
import SignalCard from "./signal-card";
import { activeSignalForStudio } from "@/lib/server/studio-signals";

export const metadata = { title: "Studio" };

// Owners with claims still in flight (filed before they created a studio)
// keep sight of them; an owner claim gets declined, never silently lost.
async function OwnerClaimsNote({ userId }: { userId: string }) {
  const claims = (await getOwnClaims(userId)).filter(
    (c) => c.status === "pending",
  );
  if (claims.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-sm text-foreground">
        You still have {claims.length === 1 ? "a claim" : "claims"} waiting on{" "}
        {claims.map((c) => c.locationName).join(", ")}. Since you now run a
        studio, {claims.length === 1 ? "it" : "they"} will be declined (one
        studio per account).
      </p>
    </div>
  );
}

// Requests waiting + the next confirmed guests, straight from the inbox data.
// The quiet hold applies here too: blocked requests never count.
async function GuestSpotSection({ userId }: { userId: string }) {
  const [inbox, stays] = await Promise.all([
    listStudioInbox(userId),
    listStudioStays(userId),
  ]);
  if (!inbox) return null;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (stays ?? [])
    .filter(
      (s) =>
        (s.status === "confirmed" || s.status === "active") &&
        s.endsOn >= today,
    )
    .slice(0, 3);
  return (
    <section className="space-y-3 rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Guest spots</h2>
        <Link
          href="/studio/requests"
          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
        >
          Open requests
        </Link>
      </div>
      <p className="text-sm text-foreground">
        {inbox.open.length === 0
          ? "No requests waiting."
          : inbox.open.length === 1
            ? "1 request waiting."
            : `${inbox.open.length} requests waiting.`}
      </p>
      {upcoming.length > 0 ? (
        <ul className="space-y-1.5">
          {upcoming.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="truncate text-foreground">{s.artistName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {s.startsOn === s.endsOn
                  ? formatDateKey(s.startsOn)
                  : `${formatDateKey(s.startsOn)} – ${formatDateKey(s.endsOn)}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default async function StudioCockpitPage() {
  if (!tattooMapEnabled()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const studio = await getOwnedStudio(user.id);

  // No studio yet: the elevation entry point, plus any claims in flight.
  if (!studio) {
    const claims = await getOwnClaims(user.id);
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">
            Run a studio
          </h1>
          <p className="text-sm text-muted-foreground">
            Put your studio on the tattoo map, host guest artists, and manage
            the whole thing from one place. You keep your own artist account;
            this just adds the studio side.
          </p>
        </header>
        {claims.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold text-foreground">
              Your claims
            </h2>
            <ul className="space-y-1.5">
              {claims.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-foreground">
                    {c.locationName}
                    {c.locationCity ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {c.locationCity}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      c.status === "pending" || c.status === "approved"
                        ? "bg-brand-mustard/20 text-brand-mustard"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {CLAIM_STATUS_LABELS[c.status] ?? "Decided"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="rounded-2xl border border-border p-5">
          <p className="text-sm text-foreground">
            To start you need your studio address and at least one social link.
            No documents, no fuss. Already on the map? Claim your studio from
            its map page instead.
          </p>
          <Link
            href="/studio/new"
            className="mt-4 inline-block rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90"
          >
            Start your studio
          </Link>
        </div>
      </div>
    );
  }

  const published = studio.publicationStatus === "published";
  const activeSignal = await activeSignalForStudio(studio.id);
  const onMap = published && studio.mapModerationStatus === "approved";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">
            {studio.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {GUEST_SPOT_STATUS_LABELS[
              studio.guestSpotStatus as GuestSpotStatus
            ] ?? studio.guestSpotStatus}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            onMap
              ? "bg-brand-mustard/20 text-brand-mustard"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {onMap
            ? "Live on the map"
            : published
              ? "Published, awaiting map review"
              : "Draft"}
        </span>
      </header>

      {/* Profile completeness: operational clarity, not a scoreboard. */}
      <section className="space-y-3 rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Profile completeness
          </h2>
          <span className="text-sm tabular-nums text-muted-foreground">
            {studio.completeness.score}%
          </span>
        </div>
        <ul className="space-y-1.5">
          {studio.completeness.items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={
                  item.done ? "text-brand-mustard" : "text-muted-foreground"
                }
              >
                {item.done ? "✓" : "○"}
              </span>
              <span
                className={
                  item.done ? "text-foreground" : "text-muted-foreground"
                }
              >
                {item.label}
                {item.required ? "" : " (optional)"}
              </span>
              <span className="sr-only">
                {item.done ? "done" : "not done yet"}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/studio/edit"
          className="inline-block rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
        >
          Edit studio
        </Link>
      </section>

      <PublishControls
        studioId={studio.id}
        published={published}
        publishReady={studio.completeness.publishReady}
        blockers={studio.completeness.publishBlockers}
      />

      <SignalCard active={activeSignal} published={published} />

      <OwnerClaimsNote userId={user.id} />

      <GuestSpotSection userId={user.id} />

      <p className="text-xs text-muted-foreground">
        Guest artists, workspaces and the studio group join this cockpit as
        those features arrive.
      </p>
    </div>
  );
}
