import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import FlashDayForm from "../flash-day-form";
import FlashDayItemsManager from "./flash-day-items-manager";
import { listDayRoster } from "@/lib/server/flash-day-membership";

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

  const [{ data: day }, { data: studios }, { data: allItems }, roster] =
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
      supabase
        .from("flash_items")
        .select("id, title, status, preview_image_url")
        .eq("artist_id", user!.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      // The day roster is junction-backed (source of truth), ordered by position.
      listDayRoster(supabase, id, user!.id),
    ]);

  if (!day) notFound();

  const linked =
    "items" in roster
      ? roster.items.map(({ id, title, status, preview_image_url }) => ({
          id,
          title,
          status,
          preview_image_url,
        }))
      : [];
  const linkedIds = new Set(linked.map((i) => i.id));
  // Candidates: every non-archived design not already in this day. A design in
  // OTHER days is still a valid candidate (many-to-many), unlike the old
  // single-FK "unattached only" filter.
  const candidates = (allItems ?? [])
    .filter((i) => !linkedIds.has(i.id))
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
        unattached={candidates}
      />
    </div>
  );
}
