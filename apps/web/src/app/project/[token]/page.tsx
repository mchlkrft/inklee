import type { Metadata } from "next";
import { notFound } from "next/navigation";
import crypto from "crypto";
import { serviceClient } from "@/lib/supabase/service";
import { signProjectMedia } from "@/lib/server/projects";
import { formatMoneyShort } from "@inklee/shared/money";
import { formatDateKey } from "@/lib/date-utils";
import {
  PROJECT_STATUS_META,
  BODY_AREAS,
  PROJECT_SCALES,
  COVERAGE_LEVELS,
  labelForKey,
  budgetRangeLabel,
  type ProjectRecord,
} from "@inklee/shared/projects";
import { STYLE_SEED } from "@inklee/shared/map-directory";
import { humanStatusLabel } from "@/lib/status-labels";

// The client's view of their project (Plus build P4 follow-up).
//
// Before this, someone filled in a long intake, saw a generic confirmation
// screen, and then had no way to see anything ever again. This is the page the
// receipt email links to.
//
// Tokenised exactly like the booking portal: the URL IS the credential, only
// its hash is stored, and there is no other way in. Which is also why it is
// noindex AND nofollow, unlike the artist's public pages: a crawler following
// this link would be walking into someone's private enquiry.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// The client's own words, not the artist's working state. `submitted` and
// `under_review` both read as "with the artist" because the difference between
// them is the artist's internal triage, which is not the client's business.
const CLIENT_STATUS: Record<string, { label: string; line: string }> = {
  submitted: {
    label: "With the artist",
    line: "Your enquiry has arrived. Big projects take a conversation before any dates get set.",
  },
  under_review: {
    label: "With the artist",
    line: "Your enquiry has arrived. Big projects take a conversation before any dates get set.",
  },
  consultation: {
    label: "Talking it through",
    line: "The artist wants to talk it through before any dates get set.",
  },
  active: {
    label: "Going ahead",
    line: "Your project is on. Sessions appear below as they are booked.",
  },
  completed: {
    label: "Finished",
    line: "That is the whole thing done.",
  },
  declined: {
    label: "Not going ahead",
    line: "The artist is not able to take this one on.",
  },
  archived: {
    label: "Closed",
    line: "This project is closed.",
  },
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="border-b border-brand-bone/10 py-3 last:border-0">
      <dt className="text-xs text-brand-bone/50">{label}</dt>
      <dd className="mt-0.5 text-sm text-brand-bone/90">{value}</dd>
    </div>
  );
}

export default async function ProjectPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const { data } = await serviceClient
    .from("projects")
    .select("*")
    .eq("customer_token_hash", hash)
    .maybeSingle();
  // A rotated (superseded) token lands here too. 404 rather than explaining
  // that a link "used to work": to an unauthenticated stranger holding a
  // guessed token, confirming that a project exists is itself a leak.
  if (!data) notFound();
  const project = data as ProjectRecord;

  const [{ data: artist }, { data: mediaRows }, { data: sessions }] =
    await Promise.all([
      serviceClient
        .from("profiles")
        .select("display_name, slug")
        .eq("id", project.artist_id)
        .single(),
      serviceClient
        .from("project_media")
        .select("id, storage_path")
        .eq("project_id", project.id)
        .order("sort_order", { ascending: true }),
      serviceClient
        .from("booking_requests")
        .select("id, status, preferred_date")
        .eq("project_id", project.id)
        .order("preferred_date", { ascending: true }),
    ]);

  const media = mediaRows ?? [];
  const signed = await signProjectMedia(media.map((m) => m.storage_path));
  const artistName = (artist?.display_name as string | null) ?? "Your artist";
  const status = CLIENT_STATUS[project.status] ?? CLIENT_STATUS.submitted;
  const eur = (cents: number) => formatMoneyShort(cents, "EUR");

  return (
    <div className="flex min-h-screen flex-col bg-brand-charcoal px-6 py-12 text-brand-bone">
      <div className="mx-auto w-full max-w-lg space-y-8">
        <div>
          <p className="text-sm text-brand-bone/60">
            Your project with {artistName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {project.title}
          </h1>
        </div>

        <div className="rounded-2xl border border-brand-bone/15 p-5">
          <p className="text-sm font-medium text-brand-bone">{status.label}</p>
          <p className="mt-1 text-sm leading-relaxed text-brand-bone/70">
            {status.line}
          </p>
        </div>

        {(sessions ?? []).length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-bone/50">
              Your sessions
            </h2>
            <ul className="space-y-2">
              {(sessions ?? []).map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border border-brand-bone/15 px-4 py-2.5 text-sm text-brand-bone/90"
                >
                  {s.preferred_date
                    ? formatDateKey(s.preferred_date as string)
                    : "Date to be confirmed"}
                  {" · "}
                  {humanStatusLabel(s.status as string)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-bone/50">
            What you sent
          </h2>
          <dl>
            <Row
              label="Your idea"
              value={
                <span className="whitespace-pre-wrap">
                  {project.description}
                </span>
              }
            />
            <Row
              label="Long-term goal"
              value={
                project.long_term_goal && (
                  <span className="whitespace-pre-wrap">
                    {project.long_term_goal}
                  </span>
                )
              }
            />
            <Row
              label="Areas"
              value={project.body_areas
                .map((a) => labelForKey(BODY_AREAS, a))
                .filter(Boolean)
                .join(", ")}
            />
            <Row
              label="Existing coverage"
              value={labelForKey(COVERAGE_LEVELS, project.coverage)}
            />
            <Row
              label="Styles"
              value={project.styles
                .map((s) => labelForKey(STYLE_SEED, s))
                .filter(Boolean)
                .join(", ")}
            />
            <Row
              label="Scale"
              value={labelForKey(PROJECT_SCALES, project.scale)}
            />
            <Row
              label="Budget"
              value={budgetRangeLabel(
                project.budget_min_cents,
                project.budget_max_cents,
                eur,
              )}
            />
          </dl>
        </section>

        {media.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-bone/50">
              Your photos
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {media.map((m) => {
                const url = signed[m.storage_path];
                if (!url) return null;
                return (
                  // Plain <img>: these are short-lived signed URLs on a private
                  // bucket, so the image optimizer would cache a link that has
                  // already expired.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m.id}
                    src={url}
                    alt=""
                    className="aspect-square w-full rounded-md object-cover"
                  />
                );
              })}
            </div>
          </section>
        )}

        <p className="text-xs text-brand-bone/40">
          This page is private to you. The artist will be in touch by email.
        </p>
      </div>
    </div>
  );
}
