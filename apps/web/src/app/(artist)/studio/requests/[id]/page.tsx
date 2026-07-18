import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  getArtistPassport,
  getStudioRequestDetail,
} from "@/lib/server/guest-spots";
import {
  DATE_FLEXIBILITY_LABELS,
  GUEST_SPOT_OPEN_STATUSES,
  guestSpotRequestStatusLabel,
  type DateFlexibility,
} from "@inklee/shared/guest-spots";
import { formatDateKey } from "@inklee/shared/date-utils";
import DecisionPanel from "./decision-panel";

export const metadata: Metadata = {
  title: "Guest spot request",
  robots: { index: false, follow: false },
};

function range(start: string, end: string) {
  if (start === end) return formatDateKey(start);
  return `${formatDateKey(start)} – ${formatDateKey(end)}`;
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

// Direct decisions are possible from these. accepted is the retryable
// materialization intermediate: showing Accept there lets the studio finish
// an acceptance that failed midway.
const DECIDABLE = new Set(["submitted", "under_review", "accepted"]);
const PASSABLE = new Set([
  "submitted",
  "under_review",
  "information_requested",
  "alternative_dates_proposed",
  "artist_reviewing_proposal",
]);
// Suggesting dates stays possible while a suggestion is out (supersedes it).
const PROPOSABLE = new Set([
  "submitted",
  "under_review",
  "alternative_dates_proposed",
]);

export default async function StudioRequestDetailPage({
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

  const detail = await getStudioRequestDetail(user.id, id);
  if (!detail) notFound();

  // Quiet hold: a blacklisted artist's request is fully readable, but the
  // panel narrows to Pass so a stay cannot be confirmed by accident.
  const { data: blockEntry } = await serviceClient
    .from("studio_blacklists")
    .select("id")
    .eq("studio_profile_id", detail.studioProfileId)
    .eq("artist_user_id", detail.artistUserId)
    .maybeSingle();
  const blocked = Boolean(blockEntry);

  const social = safeHttpUrl(detail.socialLink);
  const open = (GUEST_SPOT_OPEN_STATUSES as string[]).includes(detail.status);
  // Only opted-in passports render (private by default).
  const passport = await getArtistPassport(detail.artistUserId);
  const startDate = detail.stay?.startsOn ?? detail.startDate;
  const endDate = detail.stay?.endsOn ?? detail.endDate;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/studio/requests"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Guest spot requests
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {detail.artistName}
          </h1>
          <span className="rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs text-brand-mustard">
            {guestSpotRequestStatusLabel(detail.status)}
          </span>
          {blocked ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Blocked artist
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {range(startDate, endDate)}
          {detail.stay
            ? null
            : ` · ${
                DATE_FLEXIBILITY_LABELS[
                  detail.dateFlexibility as DateFlexibility
                ] ?? detail.dateFlexibility
              }`}
        </p>
      </header>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Introduction
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {detail.introduction}
          </p>
        </div>
        {detail.expectedClients ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Expected clients
            </p>
            <p className="text-sm text-foreground">{detail.expectedClients}</p>
          </div>
        ) : null}
        {detail.equipmentNeeds ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Equipment needs
            </p>
            <p className="text-sm text-foreground">{detail.equipmentNeeds}</p>
          </div>
        ) : null}
        {passport && passport.completedCount > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Guest spot passport
            </p>
            <p className="text-sm text-foreground">
              {passport.completedCount === 1
                ? "1 completed guest spot"
                : `${passport.completedCount} completed guest spots`}
              {passport.recent.length > 0
                ? `, most recently ${passport.recent
                    .slice(0, 2)
                    .map((s) =>
                      s.city ? `${s.studioName} (${s.city})` : s.studioName,
                    )
                    .join(" and ")}`
                : ""}
              .
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {social ? (
            <a
              href={social}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              Portfolio link
            </a>
          ) : null}
          {detail.artistSlug ? (
            <a
              href={`/${detail.artistSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              Inklee page
            </a>
          ) : null}
        </div>
      </section>

      {detail.proposal &&
      (detail.status === "alternative_dates_proposed" ||
        detail.status === "artist_reviewing_proposal") ? (
        <section className="space-y-1 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Your suggested dates
          </h2>
          <p className="text-sm text-foreground">
            {range(detail.proposal.startDate, detail.proposal.endDate)}
          </p>
          <p className="text-xs text-muted-foreground">
            Waiting for the artist to take or pass on them.
          </p>
        </section>
      ) : null}

      {detail.stay?.termsSnapshot ? (
        <section className="space-y-2 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Agreed at confirmation
          </h2>
          <p className="text-sm text-foreground">
            {range(detail.stay.startsOn, detail.stay.endsOn)}
            {detail.stay.termsSnapshot.capturedAt
              ? ` · confirmed ${formatDateKey(detail.stay.termsSnapshot.capturedAt.slice(0, 10))}`
              : ""}
          </p>
          {detail.stay.termsSnapshot.houseRules.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Your house rules were captured with the confirmation (
              {detail.stay.termsSnapshot.houseRules.length}); later edits do not
              change what was agreed.
            </p>
          ) : null}
        </section>
      ) : null}

      {detail.notes.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Notes to the artist
          </h2>
          <ul className="space-y-2">
            {detail.notes.map((n) => (
              <li key={n.id} className="text-sm text-foreground">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateKey(n.createdAt.slice(0, 10))}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open || detail.status === "confirmed" ? (
        <DecisionPanel
          requestId={detail.id}
          canDecide={!blocked && DECIDABLE.has(detail.status)}
          canPass={PASSABLE.has(detail.status)}
          canPropose={!blocked && PROPOSABLE.has(detail.status)}
          retryAccept={detail.status === "accepted"}
        />
      ) : null}
    </div>
  );
}
