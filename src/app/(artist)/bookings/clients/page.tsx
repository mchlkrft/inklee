import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { relativeTime } from "@/lib/format";
import StatusBadge from "@/components/status-badge";
import CopyButton from "@/components/copy-button";

type ClientRow = {
  email: string;
  handle: string;
  bookingCount: number;
  lastBookingAt: string;
  latestStatus: string;
};

export default async function ClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", user!.id)
    .single();
  const publicUrl = profile?.slug
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${profile.slug}`
    : null;

  const { data: bookings } = await supabase
    .from("booking_requests")
    .select("customer_email, customer_handle, status, created_at")
    .eq("artist_id", user!.id)
    .not("customer_email", "is", null)
    .order("created_at", { ascending: false });

  const map = new Map<string, ClientRow>();
  for (const b of bookings ?? []) {
    const email = b.customer_email!;
    if (!map.has(email)) {
      map.set(email, {
        email,
        handle: b.customer_handle ?? "",
        bookingCount: 1,
        lastBookingAt: b.created_at,
        latestStatus: b.status,
      });
    } else {
      map.get(email)!.bookingCount++;
    }
  }

  const clients = [...map.values()];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {clients.length} unique{" "}
          {clients.length === 1 ? "customer" : "customers"}
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-md border border-border px-6 py-12 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No clients yet. Share your booking link to start accepting requests.
          </p>
          {publicUrl && (
            <div className="flex items-center justify-center gap-2">
              <CopyButton text={publicUrl} />
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs rounded border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
              >
                Preview &rarr;
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border divide-y divide-border">
          {clients.map((client) => (
            <Link
              key={client.email}
              href={`/bookings/clients/${encodeURIComponent(client.email)}`}
              className="flex items-center px-4 py-3 gap-4 hover:bg-muted/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  {client.handle ? `@${client.handle}` : client.email}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {client.email}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {client.bookingCount}{" "}
                {client.bookingCount === 1 ? "booking" : "bookings"}
              </span>
              <StatusBadge status={client.latestStatus} />
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                {relativeTime(client.lastBookingAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
