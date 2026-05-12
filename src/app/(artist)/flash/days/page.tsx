import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import FeatureIntroModal from "@/components/feature-intro-modal";

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

export default async function FlashDaysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: days } = await supabase
    .from("flash_days")
    .select("*, flash_items(id)")
    .eq("artist_id", user!.id)
    .order("scheduled_on", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Flash Days
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group flash items into a scheduled event or day.
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
            New day
          </Link>
        </div>
      </div>

      {!days || days.length === 0 ? (
        <div className="rounded-[20px] border border-border px-6 py-12 text-center space-y-3">
          <p className="text-base text-muted-foreground">
            No flash days yet. Create a day to group flash items into an event.
          </p>
          <Link
            href="/flash/days/new"
            className="inline-block rounded-md border border-border px-4 py-2 text-sm text-muted-foreground"
          >
            Create flash day
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-border divide-y divide-border">
          {days.map((day) => {
            const itemCount = Array.isArray(day.flash_items)
              ? day.flash_items.length
              : 0;
            return (
              <div
                key={day.id}
                className="flex items-center justify-between px-5 py-4 gap-4"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">
                      {day.title}
                    </p>
                    <DayStatusPill status={day.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {day.scheduled_on ?? "No date set"}
                    {day.location ? ` · ${day.location}` : ""}
                    {" · "}
                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <Link
                  href={`/flash/days/${day.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  Edit
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
