import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import { relativeTime, formatDate } from "@/lib/format";
import { humanStatusLabel } from "@/lib/status-labels";
import CopyButton from "@/components/copy-button";
import FeatureIntroModal from "@/components/feature-intro-modal";

// Labels mirror the StatusBadge / humanStatusLabel vocabulary so the chip
// row and the row badges below speak the same language. URL `value`s stay
// as the DB enum (`approved` / `rejected`) — bookmarks + deep links survive.
const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Accepted", value: "approved" },
  { label: "Deposit pending", value: "deposit_pending" },
  { label: "Passed", value: "rejected" },
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
  trip,
  publicUrl,
}: {
  status: string;
  trip: string;
  publicUrl: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trips } = await supabase
    .from("trips")
    .select("id, title")
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });

  let query = supabase
    .from("booking_requests")
    .select(
      "id, status, customer_handle, preferred_date, form_data, created_at",
    )
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);
  if (trip !== "all") query = query.eq("trip_id", trip);

  const { data: bookings } = await query;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const href =
            f.value === "all"
              ? trip !== "all"
                ? `/bookings/overview?trip=${trip}`
                : "/bookings/overview"
              : trip !== "all"
                ? `/bookings/overview?status=${f.value}&trip=${trip}`
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

      {trips && trips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={
              status !== "all"
                ? `/bookings/overview?status=${status}`
                : "/bookings/overview"
            }
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              trip === "all"
                ? "bg-brand-mustard text-brand-charcoal"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All trips
          </Link>
          {trips.map((t) => {
            const href =
              status !== "all"
                ? `/bookings/overview?status=${status}&trip=${t.id}`
                : `/bookings/overview?trip=${t.id}`;
            return (
              <Link
                key={t.id}
                href={href}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  trip === t.id
                    ? "bg-brand-mustard text-brand-charcoal"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.title}
              </Link>
            );
          })}
        </div>
      )}

      {!bookings || bookings.length === 0 ? (
        <div className="space-y-3 rounded-[20px] border border-border px-6 py-12 text-center">
          <p className="text-base text-muted-foreground">
            {status === "all"
              ? "No requests yet — share your booking link to get started."
              : `No ${humanStatusLabel(status).toLowerCase()} requests.`}
          </p>
          {status === "all" && publicUrl && (
            <div className="flex items-center justify-center gap-2">
              <CopyButton text={publicUrl} />
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground"
              >
                Preview
              </a>
            </div>
          )}
        </div>
      ) : (
        <>
          <ul className="md:hidden space-y-2">
            {bookings.map((b) => {
              const fd = b.form_data as Record<string, string> | null;
              const meta = [
                fd?.size,
                b.preferred_date ? formatDate(b.preferred_date) : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={b.id}>
                  <Link
                    href={`/bookings/requests/${b.id}`}
                    className="block rounded-[20px] border border-border p-4 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          @{b.customer_handle}
                        </p>
                        {fd?.placement && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {fd.placement}
                          </p>
                        )}
                        {meta && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {meta}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {relativeTime(b.created_at)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block overflow-hidden rounded-[20px] border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-[color:var(--color-workspace-hover)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Handle
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Placement
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">
                    Size
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">
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
                      className="cursor-pointer transition-colors hover:bg-[color:var(--color-workspace-hover)]"
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
                          {b.preferred_date
                            ? formatDate(b.preferred_date)
                            : "-"}
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
        </>
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
        <div className="rounded-[20px] border border-border px-6 py-12 text-center space-y-3">
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
                className="text-sm rounded-md border border-border px-3 py-1.5 text-muted-foreground"
              >
                Preview &rarr;
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-border divide-y divide-border">
          {clients.map((client) => (
            <Link
              key={client.email}
              href={`/bookings/clients/${encodeURIComponent(client.email)}`}
              className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-[color:var(--color-workspace-hover)] md:flex-row md:items-center md:gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  {client.handle ? `@${client.handle}` : client.email}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {client.email}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:shrink-0">
                <span className="text-sm text-muted-foreground">
                  {client.bookingCount}{" "}
                  {client.bookingCount === 1 ? "booking" : "bookings"}
                </span>
                <StatusBadge status={client.latestStatus} />
                <span className="hidden text-sm text-muted-foreground sm:block">
                  {relativeTime(client.lastBookingAt)}
                </span>
              </div>
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
  searchParams: Promise<{
    view?: string;
    status?: string;
    trip?: string;
    leg?: string;
  }>;
}) {
  const {
    view = "requests",
    status = "all",
    trip: tripParam,
    leg: legacyLeg,
  } = await searchParams;
  const trip = tripParam ?? legacyLeg ?? "all";
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Bookings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Requests, statuses, and clients in one place.
          </p>
        </div>
        <FeatureIntroModal
          featureKey="overview"
          isEmpty={(requestCount ?? 0) === 0}
        />
      </div>

      <div className="relative border-b border-border">
        <div className="flex h-11 items-center gap-1">
          {tabs.map((tab) => {
            const isActive = view === tab.value;
            return (
              <Link
                key={tab.value}
                href={`/bookings/overview?view=${tab.value}`}
                className={`relative shrink-0 h-full inline-flex items-center px-3 text-sm transition-colors ${
                  isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-[1.5px] h-[1.5px] bg-brand-mustard"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {view === "clients" ? (
        <ClientsView publicUrl={publicUrl} />
      ) : (
        <RequestsView status={status} trip={trip} publicUrl={publicUrl} />
      )}
    </div>
  );
}
