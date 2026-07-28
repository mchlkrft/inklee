import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadProject, signProjectMedia } from "@/lib/server/projects";
import { formatMoneyShort } from "@inklee/shared/money";
import { formatDateKey } from "@/lib/date-utils";
import {
  PROJECT_STATUS_META,
  BODY_AREAS,
  PROJECT_SCALES,
  SESSION_COMMITMENTS,
  CONSULTATION_METHODS,
  COVERAGE_LEVELS,
  labelForKey,
  budgetRangeLabel,
} from "@inklee/shared/projects";
import { STYLE_SEED } from "@inklee/shared/map-directory";
import { humanStatusLabel } from "@/lib/status-labels";
import {
  StatusControls,
  NoteForm,
  LinkBookingForm,
  UnlinkButton,
} from "./project-controls";

export const metadata = { title: "Project" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="border-b border-border py-3 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const project = await loadProject(user!.id, id);
  if (!project) notFound();

  const [{ data: mediaRows }, { data: linked }, { data: candidateRows }] =
    await Promise.all([
      supabase
        .from("project_media")
        .select("id, storage_path, kind")
        .eq("project_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("booking_requests")
        .select("id, status, preferred_date, created_at")
        .eq("project_id", id)
        .order("preferred_date", { ascending: true }),
      // Attachable sessions: this client's other bookings that belong to no
      // project yet. Scoped by email rather than by anything account-shaped,
      // because a project client is not a platform account.
      supabase
        .from("booking_requests")
        .select("id, status, preferred_date, created_at")
        .eq("artist_id", user!.id)
        .eq("customer_email", project.customer_email)
        .is("project_id", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const media = mediaRows ?? [];
  const signed = await signProjectMedia(media.map((m) => m.storage_path));

  const bookingLabel = (b: {
    status: string;
    preferred_date: string | null;
    created_at: string;
  }) =>
    `${b.preferred_date ? formatDateKey(b.preferred_date) : "No date"} · ${humanStatusLabel(b.status)}`;

  const eur = (cents: number) => formatMoneyShort(cents, "EUR");
  const meta = PROJECT_STATUS_META[project.status];

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link
          href="/bookings/projects"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          &larr; Projects
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          {project.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {meta.label}. {meta.description}
        </p>
      </div>

      <StatusControls projectId={project.id} status={project.status} />

      <section className="space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          The enquiry
        </h2>
        <dl>
          <Row
            label="Client"
            value={
              <>
                {project.customer_email}
                {project.customer_handle && ` · ${project.customer_handle}`}
              </>
            }
          />
          <Row
            label="What they want"
            value={
              <span className="whitespace-pre-wrap">{project.description}</span>
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
          <Row label="Free areas" value={project.available_areas} />
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
            label="Session commitment"
            value={labelForKey(SESSION_COMMITMENTS, project.session_commitment)}
          />
          <Row label="Travel" value={project.travel_availability} />
          <Row
            label="Budget"
            value={budgetRangeLabel(
              project.budget_min_cents,
              project.budget_max_cents,
              eur,
            )}
          />
          <Row
            label="Prefers to talk by"
            value={labelForKey(
              CONSULTATION_METHODS,
              project.consultation_method,
            )}
          />
        </dl>
      </section>

      {media.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Photos
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {media.map((m) => {
              const url = signed[m.storage_path];
              if (!url) return null;
              return (
                <a
                  key={m.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block aspect-square overflow-hidden rounded-md border border-border"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </a>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Sessions
        </h2>
        {(linked ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sessions attached yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {(linked ?? []).map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-md border border-border px-4 py-2.5"
              >
                <Link
                  href={`/bookings/requests/${b.id}`}
                  className="text-sm text-foreground transition-colors hover:text-muted-foreground"
                >
                  {bookingLabel(b)}
                </Link>
                <UnlinkButton projectId={project.id} bookingId={b.id} />
              </li>
            ))}
          </ul>
        )}
        <LinkBookingForm
          projectId={project.id}
          candidates={(candidateRows ?? []).map((b) => ({
            id: b.id,
            label: bookingLabel(b),
          }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Your notes
        </h2>
        <NoteForm projectId={project.id} note={project.artist_note} />
      </section>
    </div>
  );
}
