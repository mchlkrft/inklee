import { createClient } from "@/lib/supabase/server";
import FlashDayForm from "../flash-day-form";

export default async function NewFlashDayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: studios } = await supabase
    .from("studios")
    .select("id, name, city, country")
    .eq("artist_id", user!.id)
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          New flash day
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Group flash items into a scheduled event.
        </p>
      </div>
      <FlashDayForm studios={studios ?? []} />
    </div>
  );
}
