import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import StatusBadge from "@/components/status-badge";
import { relativeTime, formatDate } from "@/lib/format";
import { humanStatusLabel } from "@/lib/status-labels";
import CopyButton from "@/components/copy-button";
import FeatureIntroModal from "@/components/feature-intro-modal";
import { Card, CardHeader, IconChip } from "@/components/ui/card";
import WaitlistActions from "../waitlist/waitlist-actions";
import FilterRow, { type FilterGroup } from "./filter-row";
import { publicArtistUrl } from "@/lib/public-url";
import { customerLabel } from "@/lib/booking-domain";
import { formatSize } from "@/lib/booking-schema";

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
  totalRequestCount,
}: {
  status: string;
  trip: string;
  publicUrl: string | null;
  /** Used as the filter-row visibility threshold — chips only render when
   *  there are at least 8 total bookings so short lists don't get cluttered. */
  totalRequestCount: number;
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
      "id, status, customer_handle, customer_email, preferred_date, form_data, created_at",
    )
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);
  if (trip !== "all") query = query.eq("trip_id", trip);

  const { data: bookings } = await query;

  // Build filter groups. Hrefs always preserve the other group's active
  // value so toggling status doesn't drop the trip filter and vice versa.
  // ?view=requests is kept so the Bookings tab stays selected on return.
  const buildHref = (nextStatus: string, nextTrip: string) => {
    const params = new URLSearchParams({ view: "requests" });
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextTrip !== "all") params.set("trip", nextTrip);
    return `/bookings/overview?${params.toString()}`;
  };

  const filterGroups: FilterGroup[] = [
    {
      heading: "Status",
      options: STATUS_FILTERS.map((f) => ({
        label: f.label,
        value: f.value,
        href: buildHref(f.value, trip),
      })),
      activeValue: status,
      resetValue: "all",
    },
  ];
  if (trips && trips.length > 0) {
    filterGroups.push({
      heading: "Trip",
      options: [
        { label: "All trips", value: "all", href: buildHref(status, "all") },
        ...trips.map((t) => ({
          label: t.title,
          value: t.id,
          href: buildHref(status, t.id),
        })),
      ],
      activeValue: trip,
      resetValue: "all",
    });
  }

  return (
    <div className="space-y-5">
      <FilterRow count={totalRequestCount} groups={filterGroups} />

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
                formatSize(fd?.size),
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
                          {customerLabel(b.customer_handle, b.customer_email)}
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
                          {customerLabel(b.customer_handle, b.customer_email)}
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
                          {formatSize(fd?.size) || "-"}
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

function buildCityDemand(
  entries: { city_text: string | null }[],
): { city: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.city_text?.trim()) continue;
    const key = entry.city_text.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      city: key.charAt(0).toUpperCase() + key.slice(1),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

async function WaitlistView({
  publicUrl,
  waitlistPublicUrl,
}: {
  publicUrl: string | null;
  waitlistPublicUrl: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: entries } = await supabase
    .from("waitlist_entries")
    .select(
      "id, customer_handle, customer_email, note, status, created_at, city_text",
    )
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });

  const list = entries ?? [];
  const cityDemand = buildCityDemand(list);

  return (
    <div className="space-y-5">
      {/* Always-available share link — the public /[slug]/waitlist URL
          works regardless of books-open state, so artists can collect
          city-specific signups while travelling without flipping books
          closed first. */}
      {waitlistPublicUrl && (
        <div className="rounded-[20px] border border-border px-5 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <IconChip icon={MapPin} tint="cobalt" size="sm" />
            <p className="text-sm font-medium text-foreground">
              Shareable waitlist link
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Always accepts signups — even while your books are open. Share it
            when you’re collecting interest from a specific city.
          </p>
          <p className="font-mono text-sm text-foreground break-all">
            {waitlistPublicUrl.replace(/^https?:\/\//, "")}
          </p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={waitlistPublicUrl} />
            <a
              href={waitlistPublicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              Preview
            </a>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-[20px] border border-border px-6 py-12 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Waitlist signups appear here when someone joins from your public
            booking page or the shareable link above.
          </p>
          {publicUrl && (
            <Link
              href="/bookings/settings"
              className="inline-block text-xs rounded-md border border-border px-3 py-1.5 text-muted-foreground"
            >
              Open Booking Settings →
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Demand by city */}
          <Card className="space-y-4">
            <CardHeader>
              <IconChip icon={MapPin} tint="cobalt" />
              <p className="text-sm font-medium text-foreground">
                Demand by city
              </p>
              <span className="ml-auto text-xs text-muted-foreground">
                {list.length} on waitlist
              </span>
            </CardHeader>
            {cityDemand.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No city demand yet. New waitlist entries can include a city so
                you can plan future guest spots.
              </p>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {cityDemand.map(({ city, count }) => (
                    <li key={city} className="flex items-center gap-3">
                      <div
                        className="h-2 rounded-full bg-brand-mustard shrink-0"
                        style={{
                          width: `${Math.round((count / cityDemand[0].count) * 120)}px`,
                          minWidth: "12px",
                        }}
                      />
                      <span className="text-sm text-foreground">{city}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {count} {count === 1 ? "person" : "people"}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/travel"
                  className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Plan a guest spot for this demand →
                </Link>
              </>
            )}
          </Card>

          {/* Entry list */}
          <div className="overflow-hidden rounded-[20px] border border-border divide-y divide-border">
            {list.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <IconChip icon={Users} tint="rosa" size="sm" />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground truncate">
                        @{entry.customer_handle}
                      </p>
                      <StatusBadge status={entry.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.customer_email}
                    </p>
                    {entry.city_text && (
                      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" strokeWidth={1.8} />
                        {entry.city_text}
                      </p>
                    )}
                    {entry.note && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {entry.note}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {relativeTime(entry.created_at)}
                    </p>
                  </div>
                </div>
                <WaitlistActions
                  entryId={entry.id}
                  status={entry.status}
                  customerEmail={entry.customer_email}
                  customerHandle={entry.customer_handle}
                  note={entry.note ?? ""}
                />
              </div>
            ))}
          </div>
        </>
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
  const publicUrl = profile?.slug ? publicArtistUrl(profile.slug) : null;
  const waitlistPublicUrl = profile?.slug
    ? publicArtistUrl(profile.slug, { subpath: "/waitlist" })
    : null;

  const tabs = [
    { label: "Requests", value: "requests" },
    { label: "Clients", value: "clients" },
    { label: "Waitlist", value: "waitlist" },
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
      ) : view === "waitlist" ? (
        <WaitlistView
          publicUrl={publicUrl}
          waitlistPublicUrl={waitlistPublicUrl}
        />
      ) : (
        <RequestsView
          status={status}
          trip={trip}
          publicUrl={publicUrl}
          totalRequestCount={requestCount ?? 0}
        />
      )}
    </div>
  );
}
