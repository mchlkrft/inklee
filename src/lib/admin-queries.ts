import { serviceClient } from "@/lib/supabase/service";

export type DateRange = "7" | "30" | "90" | "all";

export function periodBounds(range: DateRange): {
  current: string | null;
  previous: string | null;
} {
  if (range === "all") return { current: null, previous: null };
  const days = parseInt(range);
  const now = Date.now();
  const current = new Date(now - days * 86400000).toISOString();
  const previous = new Date(now - 2 * days * 86400000).toISOString();
  return { current, previous };
}

async function countWhere(
  table: string,
  filters: Record<string, string | null> = {},
  fromDate?: string | null,
  dateCol = "created_at",
): Promise<number> {
  let q = serviceClient
    .from(table)
    .select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) {
    if (v !== null) q = q.eq(k, v);
  }
  if (fromDate) q = q.gte(dateCol, fromDate);
  if (table === "profiles") q = q.eq("is_tester", false);
  const { count } = await q;
  return count ?? 0;
}

async function testerIds(): Promise<string[]> {
  const { data } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("is_tester", true);
  return (data ?? []).map((r) => r.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function excludeTesters(q: any, excluded: string[]): any {
  return excluded.length > 0
    ? q.not("artist_id", "in", `(${excluded.join(",")})`)
    : q;
}

// ── KPIs ────────────────────────────────────────────────────────────────────

export async function getKpis(range: DateRange) {
  const { current, previous } = periodBounds(range);
  const excluded = await testerIds();

  const [
    totalArtists,
    activatedArtists,
    newSignupsCurrent,
    newSignupsPrevious,
    bookingsCurrent,
    bookingsPrevious,
    confirmedCurrent,
    confirmedPrevious,
    cancelledCurrent,
    rejectedCurrent,
  ] = await Promise.all([
    countWhere("profiles"),
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("settings->>onboarding_completed", "true")
      .eq("is_tester", false)
      .then((r) => r.count ?? 0),
    countWhere("profiles", {}, current),
    countWhere("profiles", {}, previous),
    excludeTesters(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true }),
      excluded,
    )
      .gte("created_at", current ?? "2000-01-01")
      .then((r: { count: number | null }) => r.count ?? 0),
    excludeTesters(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true }),
      excluded,
    )
      .gte("created_at", previous ?? "2000-01-01")
      .lt("created_at", current ?? new Date().toISOString())
      .then((r: { count: number | null }) => r.count ?? 0),
    excludeTesters(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      excluded,
    )
      .gte("created_at", current ?? "2000-01-01")
      .then((r: { count: number | null }) => r.count ?? 0),
    excludeTesters(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      excluded,
    )
      .gte("created_at", previous ?? "2000-01-01")
      .lt("created_at", current ?? new Date().toISOString())
      .then((r: { count: number | null }) => r.count ?? 0),
    excludeTesters(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled"),
      excluded,
    )
      .gte("created_at", current ?? "2000-01-01")
      .then((r: { count: number | null }) => r.count ?? 0),
    excludeTesters(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected"),
      excluded,
    )
      .gte("created_at", current ?? "2000-01-01")
      .then((r: { count: number | null }) => r.count ?? 0),
  ]);

  // Active artists: had at least one booking request in period (proxy for activity)
  const { data: activeArtistsCurrent } = await excludeTesters(
    serviceClient.from("booking_requests").select("artist_id"),
    excluded,
  ).gte("created_at", current ?? "2000-01-01");
  const activeNow = new Set(
    activeArtistsCurrent?.map((r: { artist_id: string }) => r.artist_id),
  ).size;

  const { data: activeArtistsPrevious } = previous
    ? await excludeTesters(
        serviceClient.from("booking_requests").select("artist_id"),
        excluded,
      )
        .gte("created_at", previous)
        .lt("created_at", current!)
    : { data: [] };
  const activePrev = new Set(
    (activeArtistsPrevious ?? []).map(
      (r: { artist_id: string }) => r.artist_id,
    ),
  ).size;

  // Median response time (decided_at - created_at) for decided bookings
  const { data: decidedRows } = await excludeTesters(
    serviceClient
      .from("booking_requests")
      .select("created_at, decided_at")
      .not("decided_at", "is", null),
    excluded,
  )
    .gte("created_at", current ?? "2000-01-01")
    .limit(500);

  const durations = (decidedRows ?? [])
    .map(
      (r: { created_at: string; decided_at: string | null }) =>
        (new Date(r.decided_at!).getTime() - new Date(r.created_at).getTime()) /
        3600000,
    )
    .sort((a: number, b: number) => a - b);
  const medianHours =
    durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null;

  const totalBookings = bookingsCurrent;
  const confirmRate =
    totalBookings > 0
      ? Math.round((confirmedCurrent / totalBookings) * 100)
      : null;
  const cancelRate =
    totalBookings > 0
      ? Math.round((cancelledCurrent / totalBookings) * 100)
      : null;
  const activationRate =
    totalArtists > 0
      ? Math.round((activatedArtists / totalArtists) * 100)
      : null;

  return {
    totalArtists,
    activatedArtists,
    activationRate,
    newSignups: { current: newSignupsCurrent, previous: newSignupsPrevious },
    activeArtists: { current: activeNow, previous: activePrev },
    bookings: { current: bookingsCurrent, previous: bookingsPrevious },
    confirmed: { current: confirmedCurrent, previous: confirmedPrevious },
    confirmRate,
    cancelRate,
    medianResponseHours: medianHours,
  };
}

// ── Onboarding funnel ────────────────────────────────────────────────────────

export async function getOnboardingFunnel(range: DateRange) {
  const { current } = periodBounds(range);
  const fromFilter = current ?? "2000-01-01";
  const excluded = await testerIds();

  const [
    accountsCreated,
    slugClaimed,
    profileInfoSet,
    booksConfigured,
    onboardingCompleted,
    firstBookingReceived,
  ] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_tester", false)
      .gte("created_at", fromFilter)
      .then((r) => r.count ?? 0),
    // slug is always set on account creation — same as total
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_tester", false)
      .gte("created_at", fromFilter)
      .not("slug", "is", null)
      .then((r) => r.count ?? 0),
    // Profile info: has bio or location
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_tester", false)
      .gte("created_at", fromFilter)
      .or("bio.not.is.null,location.not.is.null")
      .then((r) => r.count ?? 0),
    // Books configured: books_settings in settings JSONB
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_tester", false)
      .gte("created_at", fromFilter)
      .not("settings->books_settings", "is", null)
      .then((r) => r.count ?? 0),
    // Onboarding completed flag
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_tester", false)
      .gte("created_at", fromFilter)
      .eq("settings->>onboarding_completed", "true")
      .then((r) => r.count ?? 0),
    // At least one booking received: artists with booking_requests
    excludeTesters(
      serviceClient.from("booking_requests").select("artist_id"),
      excluded,
    )
      .gte("created_at", fromFilter)
      .then((r: { data: { artist_id: string }[] | null }) => {
        const ids = new Set(r.data?.map((b) => b.artist_id));
        return ids.size;
      }),
  ]);

  return [
    { label: "Account created", count: accountsCreated },
    { label: "Slug claimed", count: slugClaimed },
    { label: "Profile info set", count: profileInfoSet },
    { label: "Books configured", count: booksConfigured },
    { label: "Onboarding complete", count: onboardingCompleted },
    { label: "First booking received", count: firstBookingReceived },
  ];
}

// ── Booking funnel ───────────────────────────────────────────────────────────

export async function getBookingFunnel(range: DateRange) {
  const { current } = periodBounds(range);
  const from = current ?? "2000-01-01";
  const excluded = await testerIds();

  let q = serviceClient
    .from("booking_requests")
    .select("status, deposit_amount, decided_at")
    .gte("created_at", from);
  if (excluded.length > 0)
    q = q.not("artist_id", "in", `(${excluded.join(",")})`);
  const { data: all } = await q;

  const rows = all ?? [];
  const submitted = rows.length;
  const reviewed = rows.filter((r) => r.decided_at !== null).length;
  const approved = rows.filter((r) => r.status === "approved").length;
  const depositRequested = rows.filter((r) => r.deposit_amount !== null).length;
  const depositPaid = rows.filter(
    (r) => r.deposit_amount !== null && r.status === "approved",
  ).length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const cancelled = rows.filter((r) => r.status === "cancelled").length;

  return [
    { label: "Submitted", count: submitted },
    { label: "Reviewed", count: reviewed },
    { label: "Approved", count: approved },
    { label: "Deposit requested", count: depositRequested },
    { label: "Deposit paid", count: depositPaid },
    { label: "Rejected", count: rejected },
    { label: "Cancelled", count: cancelled },
  ];
}

// ── Feature adoption ─────────────────────────────────────────────────────────

export async function getFeatureAdoption() {
  const excluded = await testerIds();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countDistinctArtists = async (
    table: string,
    extraFilter?: (q: any) => any,
  ): Promise<number> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = serviceClient.from(table).select("artist_id");
    if (extraFilter) q = extraFilter(q);
    if (excluded.length > 0)
      q = q.not("artist_id", "in", `(${excluded.join(",")})`);
    const { data } = await q;
    return new Set((data ?? []).map((x: { artist_id: string }) => x.artist_id))
      .size;
  };

  const [
    totalArtists,
    withCustomFields,
    withEmailTemplates,
    withSlots,
    withTravelLegs,
    withWaitlistEntries,
    withDeposits,
    withClientNotes,
    withNotifications,
  ] = await Promise.all([
    countWhere("profiles"),
    countDistinctArtists("custom_fields"),
    countDistinctArtists("email_templates"),
    countDistinctArtists("slots"),
    countDistinctArtists("travel_legs"),
    countDistinctArtists("waitlist_entries"),
    countDistinctArtists("booking_requests", (q) =>
      q.not("deposit_amount", "is", null),
    ),
    countDistinctArtists("client_notes"),
    countDistinctArtists("notifications"),
  ]);

  const pct = (n: number) =>
    totalArtists > 0 ? Math.round((n / totalArtists) * 100) : 0;

  return [
    {
      feature: "Custom fields",
      users: withCustomFields,
      pct: pct(withCustomFields),
    },
    {
      feature: "Email templates",
      users: withEmailTemplates,
      pct: pct(withEmailTemplates),
    },
    { feature: "Fixed slots", users: withSlots, pct: pct(withSlots) },
    {
      feature: "Travel / guest spots",
      users: withTravelLegs,
      pct: pct(withTravelLegs),
    },
    {
      feature: "Waitlist",
      users: withWaitlistEntries,
      pct: pct(withWaitlistEntries),
    },
    { feature: "Deposits", users: withDeposits, pct: pct(withDeposits) },
    {
      feature: "Client notes",
      users: withClientNotes,
      pct: pct(withClientNotes),
    },
    {
      feature: "Notifications",
      users: withNotifications,
      pct: pct(withNotifications),
    },
  ];
}

// ── Quality signals ──────────────────────────────────────────────────────────

export async function getQualitySignals() {
  const now = new Date().toISOString();

  const [overdueDeposits, deadAccounts, pendingOld, totalArtists] =
    await Promise.all([
      // Deposits overdue: deposit_pending and due date past
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "deposit_pending")
        .lt("deposit_due_at", now.slice(0, 10))
        .then((r) => r.count ?? 0),
      // Dead accounts: activated but zero booking requests ever
      serviceClient
        .from("profiles")
        .select("id")
        .eq("settings->>onboarding_completed", "true")
        .then(async (r) => {
          const allIds = r.data?.map((p) => p.id) ?? [];
          if (!allIds.length) return 0;
          const { data: active } = await serviceClient
            .from("booking_requests")
            .select("artist_id");
          const activeIds = new Set(active?.map((b) => b.artist_id));
          return allIds.filter((id) => !activeIds.has(id)).length;
        }),
      // Bookings pending > 7 days with no response
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .then((r) => r.count ?? 0),
      countWhere("profiles"),
    ]);

  return {
    overdueDeposits,
    deadAccounts,
    pendingOld,
    totalArtists,
  };
}

// ── Artist roster ────────────────────────────────────────────────────────────

export async function getArtistRoster() {
  const { data: profiles } = await serviceClient
    .from("profiles")
    .select(
      "id, slug, display_name, created_at, settings, account_status, is_tester",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: bookingSummary } = await serviceClient
    .from("booking_requests")
    .select("artist_id, status, created_at");

  const byArtist = new Map<
    string,
    { total: number; approved: number; lastActivity: string | null }
  >();
  for (const b of bookingSummary ?? []) {
    const cur = byArtist.get(b.artist_id) ?? {
      total: 0,
      approved: 0,
      lastActivity: null,
    };
    cur.total++;
    if (b.status === "approved") cur.approved++;
    if (!cur.lastActivity || b.created_at > cur.lastActivity)
      cur.lastActivity = b.created_at;
    byArtist.set(b.artist_id, cur);
  }

  return (profiles ?? []).map((p) => {
    const s = (p.settings ?? {}) as Record<string, unknown>;
    const stats = byArtist.get(p.id) ?? {
      total: 0,
      approved: 0,
      lastActivity: null,
    };
    return {
      id: p.id,
      slug: p.slug,
      displayName: p.display_name,
      createdAt: p.created_at,
      activated: s.onboarding_completed === true,
      accountStatus: (p.account_status as string) ?? "active",
      isTester: p.is_tester ?? false,
      totalBookings: stats.total,
      approvedBookings: stats.approved,
      lastActivity: stats.lastActivity,
    };
  });
}

// ── Account detail ───────────────────────────────────────────────────────────

export async function getAccountDetail(artistId: string) {
  const [
    profileResult,
    authUserResult,
    bookingsResult,
    flashResult,
    tripsResult,
    customFieldsResult,
    emailTemplatesResult,
    waitlistResult,
    recentBookingsResult,
    adminActionsResult,
  ] = await Promise.allSettled([
    serviceClient.from("profiles").select("*").eq("id", artistId).single(),
    serviceClient.auth.admin.getUserById(artistId),
    serviceClient
      .from("booking_requests")
      .select("status, created_at, customer_handle, form_data")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false }),
    serviceClient
      .from("flash_items")
      .select("id, status")
      .eq("artist_id", artistId),
    serviceClient
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId),
    serviceClient
      .from("custom_fields")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId),
    serviceClient
      .from("email_templates")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId),
    serviceClient
      .from("waitlist_entries")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId),
    serviceClient
      .from("booking_requests")
      .select("id, status, created_at, customer_handle, form_data")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false })
      .limit(8),
    serviceClient
      .from("admin_action_log")
      .select("id, admin_user_id, action, reason, metadata, created_at")
      .eq("target_user_id", artistId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const profile =
    profileResult.status === "fulfilled" ? profileResult.value.data : null;
  const authUser =
    authUserResult.status === "fulfilled"
      ? authUserResult.value.data.user
      : null;
  const allBookings =
    bookingsResult.status === "fulfilled"
      ? (bookingsResult.value.data ?? [])
      : [];
  const flashItems =
    flashResult.status === "fulfilled" ? (flashResult.value.data ?? []) : [];
  const tripCount =
    tripsResult.status === "fulfilled" ? (tripsResult.value.count ?? 0) : 0;
  const customFieldCount =
    customFieldsResult.status === "fulfilled"
      ? (customFieldsResult.value.count ?? 0)
      : 0;
  const emailTemplateCount =
    emailTemplatesResult.status === "fulfilled"
      ? (emailTemplatesResult.value.count ?? 0)
      : 0;
  const waitlistCount =
    waitlistResult.status === "fulfilled"
      ? (waitlistResult.value.count ?? 0)
      : 0;
  const recentBookings =
    recentBookingsResult.status === "fulfilled"
      ? (recentBookingsResult.value.data ?? [])
      : [];
  const adminActions =
    adminActionsResult.status === "fulfilled"
      ? (adminActionsResult.value.data ?? [])
      : [];

  const bookingCounts = {
    total: allBookings.length,
    pending: allBookings.filter((b) => b.status === "pending").length,
    approved: allBookings.filter((b) => b.status === "approved").length,
    rejected: allBookings.filter((b) => b.status === "rejected").length,
    cancelled: allBookings.filter((b) => b.status === "cancelled").length,
  };

  const lastActivity =
    allBookings.length > 0 ? allBookings[0].created_at : null;

  return {
    profile,
    email: authUser?.email ?? null,
    authLastSignIn: authUser?.last_sign_in_at ?? null,
    bookingCounts,
    flashCounts: {
      total: flashItems.length,
      published: flashItems.filter((f) => f.status === "published").length,
    },
    tripCount,
    customFieldCount,
    emailTemplateCount,
    waitlistCount,
    recentBookings,
    adminActions,
    lastActivity,
  };
}

// ── Booking integrity checks ─────────────────────────────────────────────────

export async function getIntegrityFlags() {
  const now = new Date().toISOString();

  const [approvedNoDecidedAt, depositPendingNoAmount, unreconciled] =
    await Promise.all([
      // Approved bookings without a decided_at timestamp
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .is("decided_at", null)
        .then((r) => r.count ?? 0),
      // Deposit-pending bookings with no deposit_amount set
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "deposit_pending")
        .is("deposit_amount", null)
        .then((r) => r.count ?? 0),
      // Deposit-pending bookings where due date is >7 days past and not paid
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "deposit_pending")
        .lt(
          "deposit_due_at",
          new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
        )
        .is("deposit_paid_at", null)
        .then((r) => r.count ?? 0),
    ]);

  void now; // suppress unused warning
  return { approvedNoDecidedAt, depositPendingNoAmount, unreconciled };
}
