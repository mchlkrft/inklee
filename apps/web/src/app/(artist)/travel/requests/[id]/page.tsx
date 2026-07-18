import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled } from "@/lib/map-features";
import { getArtistRequestDetail } from "@/lib/server/guest-spots";
import {
  getPublishedHouseRules,
  getWelcomePackForGuest,
} from "@/lib/server/studios";
import {
  HOUSE_RULE_LABELS,
  WELCOME_PACK_FIELDS,
  WELCOME_PACK_FIELD_LABELS,
  type HouseRuleKey,
} from "@inklee/shared/studio-profile";
import {
  DATE_FLEXIBILITY_LABELS,
  guestSpotRequestStatusLabel,
  type DateFlexibility,
} from "@inklee/shared/guest-spots";
import { formatDateKey } from "@inklee/shared/date-utils";
import RequestActions from "./request-actions";

export const metadata: Metadata = {
  title: "Guest spot request",
  robots: { index: false, follow: false },
};

function range(start: string, end: string) {
  if (start === end) return formatDateKey(start);
  return `${formatDateKey(start)} – ${formatDateKey(end)}`;
}

const WITHDRAWABLE = new Set([
  "submitted",
  "under_review",
  "information_requested",
  "alternative_dates_proposed",
  "artist_reviewing_proposal",
]);

export default async function ArtistRequestDetailPage({
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

  const detail = await getArtistRequestDetail(user.id, id);
  if (!detail) notFound();

  const houseRules = await getPublishedHouseRules(detail.studioProfileId);
  // Interaction plane: only a confirmed or active stay unlocks the pack.
  const welcomePack =
    detail.stay && ["confirmed", "active"].includes(detail.stay.status)
      ? await getWelcomePackForGuest(user.id, detail.studioProfileId)
      : null;

  // Confirmed requests can be cancelled through their stay.
  const stayId =
    detail.stay && ["confirmed", "active"].includes(detail.stay.status)
      ? detail.stay.id
      : null;
  // The agreed dates: once a stay exists it wins over the requested dates
  // (they differ when the artist took a date suggestion).
  const startDate = detail.stay?.startsOn ?? detail.startDate;
  const endDate = detail.stay?.endsOn ?? detail.endDate;

  const proposalOpen =
    detail.proposal !== null &&
    (detail.status === "alternative_dates_proposed" ||
      detail.status === "artist_reviewing_proposal");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/travel/requests"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Guest spot requests
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {detail.studioName}
          </h1>
          <span className="rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs text-brand-mustard">
            {guestSpotRequestStatusLabel(detail.status)}
          </span>
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

      {proposalOpen && detail.proposal ? (
        <section className="space-y-2 rounded-2xl border border-brand-mustard/60 p-4">
          <h2 className="text-sm font-semibold text-foreground">
            The studio suggested other dates
          </h2>
          <p className="text-sm text-foreground">
            {range(detail.proposal.startDate, detail.proposal.endDate)}
          </p>
          {detail.proposal.message ? (
            <p className="text-sm text-muted-foreground">
              {detail.proposal.message}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Your introduction
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
      </section>

      {welcomePack ? (
        <section className="space-y-3 rounded-2xl border border-brand-mustard/60 p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Welcome pack from {detail.studioName}
          </h2>
          <ul className="space-y-2">
            {WELCOME_PACK_FIELDS.filter((f) => welcomePack[f]).map((field) => (
              <li key={field} className="text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {WELCOME_PACK_FIELD_LABELS[field]}
                </p>
                <p className="whitespace-pre-wrap text-foreground">
                  {welcomePack[field]}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {houseRules.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            House rules at {detail.studioName}
          </h2>
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

      {detail.notes.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Notes from the studio
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

      <RequestActions
        requestId={detail.id}
        stayId={stayId}
        canWithdraw={WITHDRAWABLE.has(detail.status)}
        canAcceptProposal={proposalOpen}
      />
    </div>
  );
}
