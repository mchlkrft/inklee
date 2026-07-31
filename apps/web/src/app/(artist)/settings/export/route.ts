import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const [
    { data: profile },
    { data: bookings },
    { data: clientNotes },
    { data: customFields },
  ] = await Promise.all([
    supabase
      .from("profiles")
      // `settings` carries the artist's Link Hub (bio_page: blocks incl. image
      // galleries + socials), appearance, and booking-page settings. Included so
      // the data export is complete — image galleries and other Plus content are
      // portable and survive a downgrade (ruling 17: allow export).
      .select(
        "slug, display_name, bio, location, instagram_handle, timezone, booking_mode, created_at, settings",
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("booking_requests")
      .select(
        "id, status, customer_email, customer_handle, preferred_date, form_data, created_at, updated_at, decided_at, deposit_amount, deposit_due_at, deposit_paid_at, origin",
      )
      .eq("artist_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_notes")
      .select("customer_email, notes, updated_at")
      .eq("artist_id", user.id),
    supabase
      .from("custom_fields")
      .select("key, label, type, required, active, created_at")
      .eq("artist_id", user.id)
      .is("deleted_at", null),
  ]);

  const bookingIds = (bookings ?? []).map((b) => b.id);
  const { data: auditLog } =
    bookingIds.length > 0
      ? await supabase
          .from("audit_log")
          .select("action, event_category, timestamp, details")
          .in("booking_id", bookingIds)
          .order("timestamp", { ascending: false })
          .limit(500)
      : { data: [] };

  // Split the settings blob out of the identity fields so the Link Hub / gallery
  // / appearance data has a clear, discoverable home in the export.
  const { settings: inkleePage, ...profileFields } = (profile ?? {}) as Record<
    string,
    unknown
  >;

  const payload = {
    exported_at: new Date().toISOString(),
    artist: { id: user.id, email: user.email, ...profileFields },
    // bio_page (blocks incl. image galleries + socials), appearance, and
    // booking-page settings — the artist's full Inklee page configuration.
    inklee_page: inkleePage ?? {},
    bookings: bookings ?? [],
    client_notes: clientNotes ?? [],
    custom_fields: customFields ?? [],
    audit_log: auditLog ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="inklee-export-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
