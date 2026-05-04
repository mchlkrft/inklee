import { createClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/status-badge";
import { relativeTime } from "@/lib/format";
import WaitlistActions from "./waitlist-actions";
import Link from "next/link";
import FeatureIntroModal from "@/components/feature-intro-modal";

function buildCityDemand(
  entries: { city_text: string | null; status: string }[],
): { city: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.city_text?.trim()) continue;
    const key = entry.city_text.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      city: key.charAt(0).toUpperCase() + key.slice(1),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export default async function WaitlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: entries } = await supabase
    .from("waitlist_entries")
    .select(
      "id, customer_handle, customer_email, note, status, created_at, city_text",
    )
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });

  const list = entries ?? [];
  const cityDemand = buildCityDemand(list);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Waitlist</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            People who signed up while books were closed.
          </p>
        </div>
        <FeatureIntroModal featureKey="waitlist" isEmpty={list.length === 0} />
      </div>

      {list.length === 0 ? (
        <div className="rounded-md border border-border px-5 py-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No waitlist entries yet. Close your books to start collecting them.
          </p>
          <Link
            href="/bookings/books"
            className="inline-block text-xs rounded border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            Manage books &rarr;
          </Link>
        </div>
      ) : (
        <>
          {/* Demand by city */}
          <div className="rounded-md border border-border px-5 py-4 space-y-3">
            <p className="text-sm font-medium text-foreground">
              Demand by city
            </p>
            {cityDemand.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No city demand yet. New waitlist entries can now include a city
                or location so you can plan future guest spots.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {cityDemand.map(({ city, count }) => (
                  <li key={city} className="flex items-center gap-3">
                    <div
                      className="h-1.5 rounded-full bg-brand-mustard shrink-0"
                      style={{
                        width: `${Math.round((count / cityDemand[0].count) * 120)}px`,
                        minWidth: "12px",
                      }}
                    />
                    <span className="text-sm text-foreground">{city}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {count} {count === 1 ? "person" : "people"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Entry list */}
          <div className="rounded-md border border-border divide-y divide-border">
            {list.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      @{entry.customer_handle}
                    </p>
                    <StatusBadge status={entry.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {entry.customer_email}
                  </p>
                  {entry.city_text && (
                    <p className="text-xs text-muted-foreground">
                      📍 {entry.city_text}
                    </p>
                  )}
                  {entry.note && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {entry.note}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {relativeTime(entry.created_at)}
                  </p>
                </div>
                <WaitlistActions
                  entryId={entry.id}
                  status={entry.status}
                  customerEmail={entry.customer_email}
                  customerHandle={entry.customer_handle}
                  note={entry.note ?? ""}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
