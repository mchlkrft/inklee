import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import TravelLegForm from "./travel-leg-form";
import LegRowActions from "./leg-row-actions";

export default async function TravelSettingsPage() {
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

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold text-foreground">travel</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          guest spots and travel dates — shown on your public booking page when
          active
        </p>
      </div>

      <TravelLegForm />

      {legs && legs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">your legs</p>
          <div className="rounded-md border border-border divide-y divide-border">
            {legs.map((leg) => {
              const isCurrent =
                leg.is_active && leg.starts_on <= today && leg.ends_on >= today;
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
                      {isCurrent && (
                        <span className="text-xs text-green-500">active</span>
                      )}
                      {!leg.is_active && (
                        <span className="text-xs text-muted-foreground opacity-60">
                          off
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(leg.starts_on)} – {formatDate(leg.ends_on)}
                      {leg.studio_name ? ` · ${leg.studio_name}` : ""}
                    </p>
                  </div>
                  <LegRowActions id={leg.id} isActive={leg.is_active} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
