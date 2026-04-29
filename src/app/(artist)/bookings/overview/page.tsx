import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import { relativeTime, formatDate } from "@/lib/format";
import CopyButton from "@/components/copy-button";
import FeatureIntroModal from "@/components/feature-intro-modal";

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Deposit pending", value: "deposit_pending" },
  { label: "Rejected", value: "rejected" },
  { label: "Cancelled", value: "cancelled" },
] as const;

type ClientRow = {
  email: string;
  handle: string;
  bookingCount: number;
  lastBookingAt: string;
  latestStatus: string;
};

async function RequestsView({
  status,
  leg,
  publicUrl,
}: {
  status: string;
  leg: string;
  publicUrl: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: travelLegs } = await supabase
    .from("travel_legs")
    .select("id, city")
    .eq("artist_id", user!.id)
    .eq("is_active", true)
    .order("starts_on", { ascending: false });

  let query = supabase
    .from("booking_requests")
    .select(
      "id, status, customer_handle, preferred_date, form_data, created_at",
    )
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);
  if (leg !== "all") query = query.eq("travel_leg_id", leg);

  const { data: bookings } = await query;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const href =
            f.value === "all"
              ? leg !== "all"
                ? `/bookings/overview?leg=${leg}`
                : "/bookings/overview"
              : leg !== "all"
                ? `/bookings/overview?status=${f.value}&leg=${leg}`
                : `/bookings/overview?status=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                status === f.value
                  ? "bg-brand-mustard text-brand-charcoal"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {travelLegs && travelLegs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={
              status !== "all"
                ? `/bookings/overview?status=${status}`
                : "/bookings/overview"
            }
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              leg === "all"
                ? "bg-brand-mustard text-brand-charcoal"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All trips
          </Link>
          {travelLegs.map((l) => {
            const href =
              status !== "all"
                ? `/bookings/overview?status=${status}&leg=${l.id}`
                : `/bookings/overview?leg=${l.id}`;
            return (
              <Link
                key={l.id}
                href={href}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  leg === l.id
                    ? "bg-brand-mustard text-brand-charcoal"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.city}
              </Link>
            );
          })}
        </div>
      )}

      {!bookings || bookings.length === 0 ? (
        <div className="space-y-3 rounded-md border border-border px-6 py-12 text-center">
          <p className="text-base text-muted-foreground">
            {status === "all"
              ? "No requests yet — share your booking link to get started."
              : `No ${status.replace("_", " ")} requests.`}
          </p>
          {status === "all" && publicUrl && (
            <div className="flex items-center justify-center gap-2">
              <CopyButton text={publicUrl} />
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                Preview
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Handle
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Placement
                </th>
                <th className="hidden px-4 py-3 text-left text-sm font-medium text-muted-foreground sm:table-cell">
                  Size
                </th>
                <th className="hidden px-4 py-3 text-left text-sm font-medium text-muted-foreground md:table-cell">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Status
                </th>
                <th className="hidden px-4 py-3 text-right text-sm font-medium text-muted-foreground sm:table-cell">
                  Submitted
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.map((b) => {
                const fd = b.form_data as Record<string, string> | null;
                return (
                  <tr
                    key={b.id}
                    className="cursor-pointer transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/bookings/requests/${b.id}`}
                        className="block text-foreground"
                      >
                        @{b.customer_handle}
                      </Link>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-muted-foreground">
                      <Link
                        href={`/bookings/requests/${b.id}`}
                        className="block"
                      >
                        {fd?.placement ?? "-"}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      <Link
                        href={`/bookings/requests/${b.id}`}
                        className="block"
                      >
                        {fd?.size ?? "-"}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      <Link
                        href={`/bookings/requests/${b.id}`}
                        className="block"
                      >
                        {b.preferred_date ? formatDate(b.preferred_date) : "-"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/bookings/requests/${b.id}`}
                        className="block"
                      >
                        <StatusBadge status={b.status} />
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">
                      <Link
                        href={`/bookings/requests/${b.id}`}
                        className="block"
                      >
                        {relativeTime(b.created_at)}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function ClientsView({ publicUrl }: { publicUrl: string | null }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <div className="space-y-5">
      <p className="text-base text-muted-foreground">
        {clients.length} unique{" "}
        {clients.length === 1 ? "customer" : "customers"}
      </p>

      {clients.length === 0 ? (
        <div className="rounded-md border border-border px-6 py-12 text-center space-y-3">
          <p className="text-base text-muted-foreground">
            No clients yet. Share your booking link to start accepting requests.
          </p>
          {publicUrl && (
            <div className="flex items-center justify-center gap-2">
              <CopyButton text={publicUrl} />
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm rounded border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
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
                <p className="text-sm text-muted-foreground truncate">
                  {client.email}
                </p>
              </div>
              <span className="text-sm text-muted-foreground shrink-0">
                {client.bookingCount}{" "}
                {client.bookingCount === 1 ? "booking" : "bookings"}
              </span>
              <StatusBadge status={client.latestStatus} />
              <span className="text-sm text-muted-foreground shrink-0 hidden sm:block">
                {relativeTime(client.lastBookingAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function BookingOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; leg?: string }>;
}) {
  const { view = "requests", status = "all", leg = "all" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: requestCount }] = await Promise.all([
    supabase.from("profiles").select("slug").eq("id", user!.id).single(),
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", user!.id),
  ]);
  const publicUrl = profile?.slug
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${profile.slug}`
    : null;

  const tabs = [
    { label: "Requests", value: "requests" },
    { label: "Clients", value: "clients" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">
          Booking Overview
        </h1>
        <FeatureIntroModal
          featureKey="overview"
          isEmpty={(requestCount ?? 0) === 0}
        />
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const isActive = view === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/bookings/overview?view=${tab.value}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {view === "clients" ? (
        <ClientsView publicUrl={publicUrl} />
      ) : (
        <RequestsView status={status} leg={leg} publicUrl={publicUrl} />
      )}
    </div>
  );
}
