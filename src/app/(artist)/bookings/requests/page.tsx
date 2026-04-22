import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import { relativeTime, formatDate } from "@/lib/format";
import CopyButton from "@/components/copy-button";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Deposit pending", value: "deposit_pending" },
  { label: "Rejected", value: "rejected" },
  { label: "Cancelled", value: "cancelled" },
] as const;

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; leg?: string }>;
}) {
  const { status = "all", leg = "all" } = await searchParams;
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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Requests</h1>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const href =
            f.value === "all"
              ? leg !== "all"
                ? `?leg=${leg}`
                : "/bookings/requests"
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

      {travelLegs && travelLegs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <Link
            href={status !== "all" ? `?status=${status}` : "/bookings/requests"}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              leg === "all"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All trips
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

      {!bookings || bookings.length === 0 ? (
        <div className="space-y-3 rounded-md border border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {status === "all"
              ? "No requests yet - share your booking link to get started."
              : `No ${status.replace("_", " ")} requests.`}
          </p>
          {status === "all" && publicUrl && (
            <div className="flex items-center justify-center gap-2">
              <CopyButton text={publicUrl} />
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
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
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Handle
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Placement
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground sm:table-cell">
                  Size
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground md:table-cell">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium text-muted-foreground sm:table-cell">
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
