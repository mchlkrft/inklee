import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, relativeTime } from "@/lib/format";
import StatusBadge from "@/components/status-badge";
import NotesEditor from "./notes-editor";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const { email: encodedEmail } = await params;
  const customerEmail = decodeURIComponent(encodedEmail);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: bookings }, { data: noteRow }] = await Promise.all([
    supabase
      .from("booking_requests")
      .select(
        "id, status, preferred_date, created_at, customer_handle, form_data",
      )
      .eq("artist_id", user!.id)
      .eq("customer_email", customerEmail)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_notes")
      .select("notes")
      .eq("artist_id", user!.id)
      .eq("customer_email", customerEmail)
      .single(),
  ]);

  if (!bookings || bookings.length === 0) notFound();

  const handle = bookings[0].customer_handle;
  const approved = bookings.filter((b) => b.status === "approved").length;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/dashboard/clients"
          className="hover:text-foreground transition-colors"
        >
          clients
        </Link>
        <span>/</span>
        <span className="text-foreground">
          {handle ? `@${handle}` : customerEmail}
        </span>
      </div>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          {handle ? `@${handle}` : customerEmail}
        </h1>
        <p className="text-sm text-muted-foreground">{customerEmail}</p>
        <p className="text-xs text-muted-foreground">
          {bookings.length} {bookings.length === 1 ? "booking" : "bookings"} ·{" "}
          {approved} approved
        </p>
      </div>

      {/* Notes */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">notes</h2>
        <NotesEditor
          customerEmail={customerEmail}
          defaultNotes={noteRow?.notes ?? ""}
        />
      </section>

      {/* Booking history */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">booking history</h2>
        <div className="rounded-md border border-border divide-y divide-border">
          {bookings.map((booking) => {
            const fd = booking.form_data as Record<string, string> | null;
            return (
              <Link
                key={booking.id}
                href={`/dashboard/requests/${booking.id}`}
                className="flex items-center px-4 py-3 gap-4 hover:bg-muted/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {fd?.placement ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {booking.preferred_date
                      ? formatDate(booking.preferred_date)
                      : "no date"}{" "}
                    · submitted {relativeTime(booking.created_at)}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
