import { serviceClient } from "@/lib/supabase/service";
import { customerLabel } from "@/lib/booking-domain";

function icalDate(d: string) {
  return d.replace(/-/g, "");
}

function icalEscape(s: string) {
  // INJ-03: escape backslash/semicolon/comma, then collapse EVERY newline
  // variant (CRLF, bare CR, LF) to an escaped \n. A bare CR was previously
  // passed through, which some calendar parsers treat as a line break and use
  // to inject extra properties/events.
  return s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r\n|\r|\n/g, "\\n");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, display_name")
    .filter("settings->>ical_token", "eq", token)
    .single();

  if (!profile) {
    return new Response("not found", { status: 404 });
  }

  const { data: bookings } = await serviceClient
    .from("booking_requests")
    .select("id, preferred_date, customer_handle, customer_email, form_data")
    .eq("artist_id", profile.id)
    .eq("status", "approved")
    .not("preferred_date", "is", null);

  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const events = (bookings ?? [])
    .map((b) => {
      const fd = b.form_data as Record<string, string> | null;
      const summary = `${customerLabel(b.customer_handle, b.customer_email, "Booking")} — ${fd?.placement ?? ""}`;
      return [
        "BEGIN:VEVENT",
        `UID:${b.id}@inklee.app`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${icalDate(b.preferred_date!)}`,
        `SUMMARY:${icalEscape(summary)}`,
        fd?.description ? `DESCRIPTION:${icalEscape(fd.description)}` : "",
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .join("\r\n");

  const cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//inklee//inklee//EN",
    `X-WR-CALNAME:${icalEscape(profile.display_name)} — inklee`,
    "X-WR-TIMEZONE:UTC",
    events,
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(cal, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="inklee.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
