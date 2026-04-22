import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import TravelLegForm from "./travel-leg-form";
import LegRowActions from "./leg-row-actions";

export default async function TravelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: legs } = await supabase
    .from("travel_legs")
    .select("id, city, country, studio_name, starts_on, ends_on, is_active")
    .eq("artist_id", user!.id)
    .order("starts_on", { ascending: false });

  const today = new Date().toISOString().split("T")[0];

  const currentAndUpcoming = (legs ?? []).filter(
    (l) => l.is_active && l.ends_on >= today,
  );
  const past = (legs ?? []).filter((l) => !l.is_active || l.ends_on < today);

  return (
    <div className="space-y-10 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Travel</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Guest spots and travel dates shown on your public booking page when
          active.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">Add leg</h2>
        <TravelLegForm />
      </section>

      {currentAndUpcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            Current &amp; upcoming
          </h2>
          <div className="rounded-md border border-border divide-y divide-border">
            {currentAndUpcoming.map((leg) => {
              const isActive = leg.ends_on >= today && leg.starts_on <= today;
              return (
                <div
                  key={leg.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground">
                        {leg.city}, {leg.country}
                      </p>
                      {isActive && (
                        <span className="text-xs text-green-500">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(leg.starts_on)} - {formatDate(leg.ends_on)}
                      {leg.studio_name ? ` - ${leg.studio_name}` : ""}
                    </p>
                  </div>
                  <LegRowActions id={leg.id} isActive={leg.is_active} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Past</h2>
          <div className="rounded-md border border-border divide-y divide-border opacity-60">
            {past.map((leg) => (
              <div
                key={leg.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm text-foreground">
                    {leg.city}, {leg.country}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(leg.starts_on)} - {formatDate(leg.ends_on)}
                    {leg.studio_name ? ` - ${leg.studio_name}` : ""}
                  </p>
                </div>
                <LegRowActions id={leg.id} isActive={leg.is_active} />
              </div>
            ))}
          </div>
        </section>
      )}

      {(!legs || legs.length === 0) && (
        <div className="rounded-md border border-border px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">No travel legs yet.</p>
        </div>
      )}
    </div>
  );
}
