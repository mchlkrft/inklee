import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import FeatureIntroModal from "@/components/feature-intro-modal";
import CopyButton from "@/components/copy-button";

function DayStatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    upcoming: "bg-[color:var(--color-tint-cobalt)] text-brand-charcoal",
    active: "bg-[color:var(--color-tint-green)] text-brand-charcoal",
    past: "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)] opacity-70",
    cancelled:
      "bg-[color:var(--color-tint-red)] text-brand-charcoal opacity-70",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] ?? "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)]"}`}
    >
      {status}
    </span>
  );
}

type StudioRef = { name: string; city: string | null } | null;

function resolveLocationLabel(
  studio: StudioRef,
  locationText: string | null,
): string | null {
  if (studio) {
    return studio.city ? `${studio.name} · ${studio.city}` : studio.name;
  }
  return locationText;
}

export default async function FlashDaysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: days }, { data: profile }] = await Promise.all([
    supabase
      .from("flash_days")
      .select("*, studios:studio_id(name, city), flash_items(id)")
      .eq("artist_id", user!.id)
      .order("scheduled_on", { ascending: false }),
    supabase.from("profiles").select("slug").eq("id", user!.id).single(),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const slug = profile?.slug ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Days
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group flash designs into a scheduled event. Public days get their
            own shareable page.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <FeatureIntroModal
            featureKey="flash-days"
            isEmpty={!days || days.length === 0}
          />
          <Link
            href="/flash/days/new"
            className="rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal"
          >
            + New day
          </Link>
        </div>
      </div>

      {!days || days.length === 0 ? (
        <div className="rounded-[20px] border border-border px-6 py-12 text-center space-y-3">
          <p className="text-base text-muted-foreground">
            No days yet. Group flash designs into an event when you&apos;re
            planning a flash day or attending one.
          </p>
          <Link
            href="/flash/days/new"
            className="inline-block rounded-md border border-border px-4 py-2 text-sm text-muted-foreground"
          >
            Create your first day
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-border divide-y divide-border">
          {days.map((day) => {
            const itemCount = Array.isArray(day.flash_items)
              ? day.flash_items.length
              : 0;
            const studio = (
              Array.isArray(day.studios) ? day.studios[0] : day.studios
            ) as StudioRef;
            const locationLabel = resolveLocationLabel(studio, day.location);
            const publicUrl =
              day.is_public && slug
                ? `${appUrl}/${slug}/flash/days/${day.id}`
                : null;

            return (
              <div
                key={day.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">
                      {day.title}
                    </p>
                    <DayStatusPill status={day.status} />
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        day.is_public
                          ? "bg-[color:var(--color-tint-green)] text-brand-charcoal"
                          : "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)]"
                      }`}
                    >
                      {day.is_public ? "Public" : "Private"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {day.scheduled_on ?? "No date set"}
                    {locationLabel ? ` · ${locationLabel}` : ""}
                    {" · "}
                    {itemCount} design{itemCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                  {publicUrl && (
                    <>
                      <CopyButton
                        text={publicUrl}
                        label="Copy link"
                        copiedLabel="Copied!"
                      />
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View ↗
                      </a>
                    </>
                  )}
                  <Link
                    href={`/flash/days/${day.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
