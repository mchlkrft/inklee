import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import FlashDayForm from "../flash-day-form";

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

  const { data: day } = await supabase
    .from("flash_days")
    .select("*")
    .eq("id", id)
    .eq("artist_id", user!.id)
    .single();

  if (!day) notFound();

  const { data: linkedItems } = await supabase
    .from("flash_items")
    .select("id, title, status, booking_mode")
    .eq("flash_day_id", id)
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-8 max-w-lg">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/flash/days"
          className="hover:text-foreground transition-colors"
        >
          Flash Days
        </Link>
        <span>/</span>
        <span className="text-foreground">{day.title}</span>
      </div>

      <FlashDayForm
        initial={{
          id: day.id,
          title: day.title,
          scheduledOn: day.scheduled_on,
          location: day.location,
          description: day.description,
          status: day.status,
        }}
      />

      {linkedItems && linkedItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground border-b border-border pb-2">
            Linked flash items ({linkedItems.length})
          </h2>
          <div className="rounded-md border border-border divide-y divide-border">
            {linkedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.status} · {item.booking_mode}
                  </p>
                </div>
                <Link
                  href={`/flash/items/${item.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
