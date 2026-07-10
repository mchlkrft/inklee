import type { SupabaseClient } from "@supabase/supabase-js";
import { customerLabel } from "@/lib/booking-domain";
import { depositState } from "@/lib/deposit-state";
import { todayInTimeZone } from "@/lib/date-utils";
import { localToUTC } from "@/lib/timezone";
import type { DashboardWidgets } from "@/lib/dashboard-settings";
import type {
  MobileActionItem,
  MobileGuestSpot,
  MobileHomeBooking,
} from "@inklee/shared/mobile-api";

// The ONE source of truth for the dashboard / Home aggregate, consumed by BOTH
// the web dashboard page and the mobile GET /api/mobile/home route, so the two
// surfaces can never disagree (the founder one-source-of-truth rule). The caller
// has already read the profile (timezone, widgets, onboarding); this runs the
// data queries and builds the ranked "Action required" feed. RLS scopes
// everything to the artist via the passed client.
//
// Always-on (the redesigned glance grid + action feed): pending, upcoming,
// this-month, deposits. Ambient (gated by the artist's per-widget toggles):
// guest spots, waitlist.

const FEED_CAP = 8;

type BookingRow = {
  id: string;
  customer_handle: string | null;
  customer_email: string | null;
  preferred_date: string | null;
  created_at: string | null;
  form_data: Record<string, string> | null;
};

type DepositRow = {
  id: string;
  status: string;
  customer_handle: string | null;
  customer_email: string | null;
  deposit_amount: string | number | null;
  deposit_currency: string | null;
  deposit_due_at: string | null;
  deposit_paid_at: string | null;
  deposit_payment_intent_id: string | null;
};

type RawTripLeg = {
  id: string;
  starts_on: string;
  ends_on: string;
  studios: { name: string } | null;
};

export type DashboardData = {
  pendingCount: number;
  /** Back-compat: the newest 3 pending (the old Home cards consume this). */
  pending: MobileHomeBooking[];
  upcoming: MobileHomeBooking[];
  upcomingCount: number;
  waitlistCount: number;
  totalReceivedCount: number;
  guestSpots: MobileGuestSpot[];
  thisMonthCount: number;
  depositsOutstandingCount: number;
  depositsOverdueCount: number;
  actionItems: MobileActionItem[];
};

function mapBooking(b: BookingRow): MobileHomeBooking {
  const fd = b.form_data ?? {};
  return {
    id: b.id,
    client: customerLabel(b.customer_handle, b.customer_email),
    placement: fd.placement ?? null,
    preferredDate: b.preferred_date,
    createdAt: b.created_at,
  };
}

export async function getDashboardData(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    timezone: string;
    widgets: DashboardWidgets;
    onboardingCompleted: boolean;
  },
): Promise<DashboardData> {
  const { timezone, widgets, onboardingCompleted } = opts;
  const now = Date.now();
  const today = todayInTimeZone(timezone);
  // Month boundary as the UTC instant of local midnight on the 1st (created_at is
  // timestamptz; a bare date key would miscount the first hours of the month).
  const monthStart = localToUTC(`${today.slice(0, 7)}-01`, "00:00", timezone);

  const [
    pendingRes,
    upcomingRes,
    waitlistRes,
    totalReceivedRes,
    guestSpotsRes,
    thisMonthRes,
    depositsRes,
  ] = await Promise.all([
    // One pending query serves both the back-compat `pending` (newest 3) and the
    // feed (oldest first = most urgent). count:exact gives the true total.
    supabase
      .from("booking_requests")
      .select(
        "id, customer_handle, customer_email, created_at, preferred_date, form_data",
        { count: "exact" },
      )
      .eq("artist_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("booking_requests")
      .select(
        "id, customer_handle, customer_email, preferred_date, created_at, form_data",
        { count: "exact" },
      )
      .eq("artist_id", userId)
      .eq("status", "approved")
      .not("preferred_date", "is", null)
      .gte("preferred_date", today)
      .order("preferred_date", { ascending: true })
      .limit(3),
    widgets.waitlist
      ? supabase
          .from("waitlist_entries")
          .select("id", { count: "exact", head: true })
          .eq("artist_id", userId)
          .eq("status", "waiting")
      : Promise.resolve({ count: null }),
    onboardingCompleted
      ? supabase
          .from("booking_requests")
          .select("id", { count: "exact", head: true })
          .eq("artist_id", userId)
      : Promise.resolve({ count: null }),
    widgets.guest_spots
      ? supabase
          .from("trips")
          .select(
            "id, title, icon, icon_color, icon_bg, trip_legs(id, starts_on, ends_on, studios(name))",
          )
          .eq("artist_id", userId)
      : Promise.resolve({ data: null }),
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", userId)
      .gte("created_at", monthStart),
    // Unpaid deposits to chase (card + manual). Scoped to `deposit_pending`: a
    // deposit is only live while the booking is awaiting it. A cancelled / passed
    // / accepted-directly booking can still carry an unpaid deposit_amount, but
    // that deposit is dead and must never surface as overdue or as a "Mark
    // received" action item (the founder bug).
    supabase
      .from("booking_requests")
      .select(
        "id, status, customer_handle, customer_email, deposit_amount, deposit_currency, deposit_due_at, deposit_paid_at, deposit_payment_intent_id",
      )
      .eq("artist_id", userId)
      .eq("status", "deposit_pending")
      .not("deposit_amount", "is", null)
      .is("deposit_paid_at", null)
      .order("deposit_due_at", { ascending: true, nullsFirst: false })
      .limit(50),
  ]);

  // Pending: the query is oldest-first; the back-compat `pending` field is the
  // newest 3 (what the old Home cards expect).
  const pendingRows = (pendingRes.data ?? []) as BookingRow[];
  const pending = [...pendingRows].reverse().slice(0, 3).map(mapBooking);
  const pendingCount = pendingRes.count ?? pendingRows.length;

  const upcomingRows = (upcomingRes.data ?? []) as BookingRow[];

  const guestSpots: MobileGuestSpot[] = (
    (guestSpotsRes.data ?? []) as {
      id: string;
      title: string;
      icon?: string | null;
      icon_color?: string | null;
      icon_bg?: string | null;
      trip_legs?: unknown;
    }[]
  )
    .flatMap((t) =>
      ((t.trip_legs as unknown as RawTripLeg[]) ?? []).map((l) => ({
        id: l.id,
        tripId: t.id,
        tripTitle: t.title,
        studioName: l.studios?.name ?? null,
        startsOn: l.starts_on,
        endsOn: l.ends_on,
        icon: (t.icon ?? null) as string | null,
        iconColor: (t.icon_color ?? null) as string | null,
        iconBg: (t.icon_bg ?? null) as string | null,
      })),
    )
    .filter((l) => l.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .slice(0, 3);

  // Deposits are pre-filtered to unpaid + deposit_pending, so depositState only
  // ever returns "awaiting" or "overdue" (never paid/refunded/cancelled).
  // outstanding = all unpaid; overdue = past the due date.
  const depRows = (depositsRes.data ?? []) as DepositRow[];
  const depItems = depRows.map((d) => ({
    bookingId: d.id,
    client: customerLabel(d.customer_handle, d.customer_email),
    amount: d.deposit_amount != null ? Number(d.deposit_amount) : 0,
    currency: d.deposit_currency ?? "eur",
    dueAt: d.deposit_due_at,
    overdue: depositState(d, false, now, d.status) === "overdue",
    manual: !d.deposit_payment_intent_id,
  }));
  const depositsOutstandingCount = depItems.length;
  const depositsOverdueCount = depItems.filter((d) => d.overdue).length;

  // Feed: only MANUAL unpaid deposits are actionable here (Mark received). Card
  // deposits are awaiting the client's Stripe-link payment, nothing to do.
  const manual = depItems.filter((d) => d.manual);
  const depositItem = (d: (typeof manual)[number]): MobileActionItem => ({
    kind: "deposit",
    bookingId: d.bookingId,
    client: d.client,
    amount: d.amount,
    currency: d.currency,
    dueAt: d.dueAt,
    overdue: d.overdue,
  });
  const overdueDeposits = manual.filter((d) => d.overdue).map(depositItem);
  const awaitingDeposits = manual.filter((d) => !d.overdue).map(depositItem);
  const requestItems: MobileActionItem[] = pendingRows.map((b) => {
    const fd = b.form_data ?? {};
    return {
      kind: "request",
      bookingId: b.id,
      client: customerLabel(b.customer_handle, b.customer_email),
      placement: fd.placement ?? null,
      preferredDate: b.preferred_date,
    };
  });

  // Rank: overdue deposits -> oldest pending requests -> awaiting deposits.
  const actionItems = [
    ...overdueDeposits,
    ...requestItems,
    ...awaitingDeposits,
  ].slice(0, FEED_CAP);

  return {
    pendingCount,
    pending,
    upcoming: upcomingRows.map(mapBooking),
    upcomingCount: upcomingRes.count ?? upcomingRows.length,
    waitlistCount: waitlistRes.count ?? 0,
    totalReceivedCount: totalReceivedRes.count ?? 0,
    guestSpots,
    thisMonthCount: thisMonthRes.count ?? 0,
    depositsOutstandingCount,
    depositsOverdueCount,
    actionItems,
  };
}
