import { createClient } from "@/lib/supabase/server";
import FlashItemForm from "../flash-item-form";

export default async function NewFlashItemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flashDays } = await supabase
    .from("flash_days")
    .select("id, title, scheduled_on")
    .eq("artist_id", user!.id)
    .in("status", ["upcoming", "active"])
    .order("scheduled_on", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          New flash item
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Create a bookable design offer for your flash page.
        </p>
      </div>
      <FlashItemForm flashDays={flashDays ?? []} />
    </div>
  );
}
