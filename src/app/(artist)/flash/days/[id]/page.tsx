import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import FlashDayForm from "../flash-day-form";
import FlashDayItemsManager from "./flash-day-items-manager";

export default async function FlashDayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: day }, { data: studios }, { data: allItems }] =
    await Promise.all([
      supabase
        .from("flash_days")
        .select("*")
        .eq("id", id)
        .eq("artist_id", user!.id)
        .single(),
      supabase
        .from("studios")
        .select("id, name, city, country")
        .eq("artist_id", user!.id)
        .order("name", { ascending: true }),
      // Pull all flash items for the artist; we'll split into linked /
      // unattached client-side so the attach UI can show every option.
      supabase
        .from("flash_items")
        .select("id, title, status, preview_image_url, flash_day_id")
        .eq("artist_id", user!.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
    ]);

  if (!day) notFound();

  const items = allItems ?? [];
  const linked = items
    .filter((i) => i.flash_day_id === id)
    .map(({ id, title, status, preview_image_url }) => ({
      id,
      title,
      status,
      preview_image_url,
    }));
  const unattached = items
    .filter((i) => i.flash_day_id === null)
    .map(({ id, title, status, preview_image_url }) => ({
      id,
      title,
      status,
      preview_image_url,
    }));

  return (
    <div className="space-y-8 max-w-lg">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/flash/days"
          className="hover:text-foreground transition-colors"
        >
          Days
        </Link>
        <span>/</span>
        <span className="text-foreground">{day.title}</span>
      </div>

      <FlashDayForm
        initial={{
          id: day.id,
          title: day.title,
          scheduledOn: day.scheduled_on,
          studioId: day.studio_id,
          location: day.location,
          description: day.description,
          status: day.status,
          isPublic: day.is_public,
        }}
        studios={studios ?? []}
      />

      <FlashDayItemsManager
        dayId={day.id}
        linked={linked}
        unattached={unattached}
      />
    </div>
  );
}
