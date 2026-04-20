import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import { relativeTime, formatDate } from "@/lib/format";

const FILTERS = [
  { label: "all", value: "all" },
  { label: "pending", value: "pending" },
  { label: "approved", value: "approved" },
  { label: "deposit pending", value: "deposit_pending" },
  { label: "rejected", value: "rejected" },
  { label: "cancelled", value: "cancelled" },
] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; leg?: string }>;
}) {
  const { status = "all", leg = "all" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: travelLegs }] = await Promise.all([
    supabase.from("profiles").select("slug").eq("id", user!.id).single(),
    supabase
      .from("travel_legs")
      .select("id, city, country, starts_on, ends_on")
      .eq("artist_id", user!.id)
      .eq("is_active", true)
      .order("starts_on", { ascending: false }),
  ]);

  let query = supabase
    .from("booking_requests")
    .select(
      "id, status, customer_handle, preferred_date, form_data, created_at",
    )
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (leg !== "all") {
    query = query.eq("travel_leg_id", leg);
  }

  const { data: bookings } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">requests</h1>
        {profile && (
          <Link
            href={`/${profile.slug}`}
            target="_blank"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            /{profile.slug} ↗
          </Link>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => {
          const href =
            f.value === "all"
              ? leg !== "all"
                ? `?leg=${leg}`
                : "/dashboard"
              : leg !== "all"
                ? `?status=${f.value}&leg=${leg}`
                : `?status=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                status === f.value
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Trip filter — only shown when artist has travel legs */}
      {travelLegs && travelLegs.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          <Link
            href={status !== "all" ? `?status=${status}` : "/dashboard"}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              leg === "all"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            all trips
          </Link>
          {travelLegs.map((l) => {
            const href =
              status !== "all"
                ? `?status=${status}&leg=${l.id}`
                : `?leg=${l.id}`;
            return (
              <Link
                key={l.id}
                href={href}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  leg === l.id
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.city}
              </Link>
            );
          })}
        </div>
      )}

      {/* Table */}
      {!bookings || bookings.length === 0 ? (
        <div className="rounded-md border border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {status === "all"
              ? "no requests yet. share your booking link to get started."
              : `no ${status.replace("_", " ")} requests.`}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">
                  handle
                </th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">
                  placement
                </th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden sm:table-cell">
                  size
                </th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">
                  date
                </th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">
                  status
                </th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium hidden sm:table-cell">
                  submitted
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.map((b) => {
                const fd = b.form_data as Record<string, string> | null;
                return (
                  <tr
                    key={b.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/requests/${b.id}`}
                        className="block text-foreground"
                      >
                        @{b.customer_handle}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">
                      <Link
                        href={`/dashboard/requests/${b.id}`}
                        className="block"
                      >
                        {fd?.placement ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      <Link
                        href={`/dashboard/requests/${b.id}`}
                        className="block"
                      >
                        {fd?.size ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      <Link
                        href={`/dashboard/requests/${b.id}`}
                        className="block"
                      >
                        {b.preferred_date ? formatDate(b.preferred_date) : "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/requests/${b.id}`}
                        className="block"
                      >
                        <StatusBadge status={b.status} />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-right hidden sm:table-cell">
                      <Link
                        href={`/dashboard/requests/${b.id}`}
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
