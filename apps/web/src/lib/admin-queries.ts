import { cache } from "react";
import { buildBookingFunnel, buildIntegrityFlags } from "@/lib/admin-metrics";
import { addDaysToDateKey, localDateKey } from "@/lib/date-utils";
import { serviceClient } from "@/lib/supabase/service";

export type DateRange = "7" | "30" | "90" | "all";

export function periodBounds(range: DateRange): {
  current: string | null;
  previous: string | null;
} {
  if (range === "all") return { current: null, previous: null };

  const days = parseInt(range, 10);
  const now = Date.now();
  return {
    current: new Date(now - days * 86_400_000).toISOString(),
    previous: new Date(now - 2 * days * 86_400_000).toISOString(),
  };
}

async function countWhere(
  table: string,
  filters: Record<string, string | null> = {},
  fromDate?: string | null,
  dateCol = "created_at",
): Promise<number> {
  let query = serviceClient
    .from(table)
    .select("id", { count: "exact", head: true });

  for (const [key, value] of Object.entries(filters)) {
    if (value !== null) query = query.eq(key, value);
  }

  if (fromDate) query = query.gte(dateCol, fromDate);
  if (table === "profiles") query = query.eq("is_tester", false);

  const { count } = await query;
  return count ?? 0;
}

const testerIds = cache(async (): Promise<string[]> => {
  const { data } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("is_tester", true);
  return (data ?? []).map((row) => row.id);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function excludeArtistsQuery(query: any, excludedArtistIds: string[]): any {
  return excludedArtistIds.length > 0
    ? query.not("artist_id", "in", `(${excludedArtistIds.join(",")})`)
    : query;
}

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
    decidedRowsResult,
    activeArtistsCurrent,
    activeArtistsPrevious,
  ] = await Promise.all([
    countWhere("profiles"),
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("settings->>onboarding_completed", "true")
      .eq("is_tester", false)
      .then((result) => result.count ?? 0),
    countWhere("profiles", {}, current),
    countWhere("profiles", {}, previous),
    excludeArtistsQuery(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true }),
      excluded,
    )
      .gte("created_at", current ?? "2000-01-01")
      .then((result: { count: number | null }) => result.count ?? 0),
    excludeArtistsQuery(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true }),
      excluded,
    )
      .gte("created_at", previous ?? "2000-01-01")
      .lt("created_at", current ?? new Date().toISOString())
      .then((result: { count: number | null }) => result.count ?? 0),
    excludeArtistsQuery(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      excluded,
    )
      .gte("created_at", current ?? "2000-01-01")
      .then((result: { count: number | null }) => result.count ?? 0),
    excludeArtistsQuery(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      excluded,
    )
      .gte("created_at", previous ?? "2000-01-01")
      .lt("created_at", current ?? new Date().toISOString())
      .then((result: { count: number | null }) => result.count ?? 0),
    excludeArtistsQuery(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled"),
      excluded,
    )
      .gte("created_at", current ?? "2000-01-01")
      .then((result: { count: number | null }) => result.count ?? 0),
    excludeArtistsQuery(
      serviceClient
        .from("booking_requests")
        .select("created_at, decided_at")
        .not("decided_at", "is", null),
      excluded,
    )
      .gte("created_at", current ?? "2000-01-01")
      .limit(500),
    excludeArtistsQuery(
      serviceClient.from("booking_requests").select("artist_id"),
      excluded,
    ).gte("created_at", current ?? "2000-01-01"),
    previous
      ? excludeArtistsQuery(
          serviceClient.from("booking_requests").select("artist_id"),
          excluded,
        )
          .gte("created_at", previous)
          .lt("created_at", current!)
      : Promise.resolve({ data: [] as { artist_id: string }[] }),
  ]);

  const activeNow = new Set(
    (activeArtistsCurrent.data ?? []).map(
      (row: { artist_id: string }) => row.artist_id,
    ),
  ).size;
  const activePrev = new Set(
    (activeArtistsPrevious.data ?? []).map(
      (row: { artist_id: string }) => row.artist_id,
    ),
  ).size;

  const durations = (decidedRowsResult.data ?? [])
    .map(
      (row: { created_at: string; decided_at: string | null }) =>
        (new Date(row.decided_at!).getTime() -
          new Date(row.created_at).getTime()) /
        3_600_000,
    )
    .sort((a: number, b: number) => a - b);

  const medianHours =
    durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null;
  const confirmRate =
    bookingsCurrent > 0
      ? Math.round((confirmedCurrent / bookingsCurrent) * 100)
      : null;
  const cancelRate =
    bookingsCurrent > 0
      ? Math.round((cancelledCurrent / bookingsCurrent) * 100)
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
      .then((result) => result.count ?? 0),
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_tester", false)
      .gte("created_at", fromFilter)
      .not("slug", "is", null)
      .then((result) => result.count ?? 0),
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_tester", false)
      .gte("created_at", fromFilter)
      .or("bio.not.is.null,location.not.is.null")
      .then((result) => result.count ?? 0),
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_tester", false)
      .gte("created_at", fromFilter)
      .not("settings->books_settings", "is", null)
      .then((result) => result.count ?? 0),
    serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_tester", false)
      .gte("created_at", fromFilter)
      .eq("settings->>onboarding_completed", "true")
      .then((result) => result.count ?? 0),
    excludeArtistsQuery(
      serviceClient.from("booking_requests").select("artist_id"),
      excluded,
    )
      .gte("created_at", fromFilter)
      .then((result: { data: { artist_id: string }[] | null }) => {
        const ids = new Set(result.data?.map((booking) => booking.artist_id));
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

export async function getBookingFunnel(range: DateRange) {
  const { current } = periodBounds(range);
  const excluded = await testerIds();

  let query = serviceClient
    .from("booking_requests")
    .select("status, deposit_amount, deposit_paid_at, decided_at")
    .gte("created_at", current ?? "2000-01-01");
  query = excludeArtistsQuery(query, excluded);

  const { data } = await query;
  return buildBookingFunnel(data ?? []);
}

export async function getFeatureAdoption() {
  const excluded = await testerIds();

  const countDistinctArtists = async (
    table: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraFilter?: (query: any) => any,
  ): Promise<number> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = serviceClient.from(table).select("artist_id");
    if (extraFilter) query = extraFilter(query);
    query = excludeArtistsQuery(query, excluded);
    const { data } = await query;
    return new Set(
      (data ?? []).map((row: { artist_id: string }) => row.artist_id),
    ).size;
  };

  const [
    totalArtists,
    withCustomFields,
    withEmailTemplates,
    withSlots,
    withTrips,
    withWaitlistEntries,
    withDeposits,
    withClientNotes,
    withNotifications,
  ] = await Promise.all([
    countWhere("profiles"),
    countDistinctArtists("custom_fields"),
    countDistinctArtists("email_templates"),
    countDistinctArtists("slots"),
    countDistinctArtists("trips"),
    countDistinctArtists("waitlist_entries"),
    countDistinctArtists("booking_requests", (query) =>
      query.not("deposit_amount", "is", null),
    ),
    countDistinctArtists("client_notes"),
    countDistinctArtists("notifications"),
  ]);

  const pct = (count: number) =>
    totalArtists > 0 ? Math.round((count / totalArtists) * 100) : 0;

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
      users: withTrips,
      pct: pct(withTrips),
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

export async function getQualitySignals() {
  const today = localDateKey();
  const excluded = await testerIds();
  const pendingThreshold = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    overdueDeposits,
    activatedProfiles,
    activeBookings,
    pendingOld,
    totalArtists,
  ] = await Promise.all([
    excludeArtistsQuery(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "deposit_pending")
        .lt("deposit_due_at", today),
      excluded,
    ).then((result: { count: number | null }) => result.count ?? 0),
    serviceClient
      .from("profiles")
      .select("id")
      .eq("settings->>onboarding_completed", "true")
      .eq("is_tester", false),
    excludeArtistsQuery(
      serviceClient.from("booking_requests").select("artist_id"),
      excluded,
    ),
    excludeArtistsQuery(
      serviceClient
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("created_at", pendingThreshold),
      excluded,
    ).then((result: { count: number | null }) => result.count ?? 0),
    countWhere("profiles"),
  ]);

  const activeArtistIds = new Set(
    (activeBookings.data ?? []).map(
      (booking: { artist_id: string }) => booking.artist_id,
    ),
  );
  const deadAccounts = (activatedProfiles.data ?? []).filter(
    (profile: { id: string }) => !activeArtistIds.has(profile.id),
  ).length;

  return {
    overdueDeposits,
    deadAccounts,
    pendingOld,
    totalArtists,
  };
}

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

  // Plan state for the roster. Nothing sweeps plan_expires_at, so without a
  // column here a founder cannot see who is comped or whose comp is about to
  // lapse without opening every account page in turn. Scoped to the profiles
  // actually being rendered: an unfiltered select would hit PostgREST's 1000
  // row ceiling once enough override rows exist and silently render comped
  // artists as Free.
  const { data: overrideRows } = await serviceClient
    .from("account_overrides")
    .select("artist_id, plan_tier, plan_source, plan_expires_at")
    .in(
      "artist_id",
      (profiles ?? []).map((p) => p.id),
    );
  const overridesByArtist = new Map(
    (overrideRows ?? []).map((r) => [r.artist_id as string, r]),
  );

  const byArtist = new Map<
    string,
    { total: number; approved: number; lastActivity: string | null }
  >();

  for (const booking of bookingSummary ?? []) {
    const current = byArtist.get(booking.artist_id) ?? {
      total: 0,
      approved: 0,
      lastActivity: null,
    };
    current.total++;
    if (booking.status === "approved") current.approved++;
    if (!current.lastActivity || booking.created_at > current.lastActivity) {
      current.lastActivity = booking.created_at;
    }
    byArtist.set(booking.artist_id, current);
  }

  return (profiles ?? []).map((profile) => {
    const settings = (profile.settings ?? {}) as Record<string, unknown>;
    const stats = byArtist.get(profile.id) ?? {
      total: 0,
      approved: 0,
      lastActivity: null,
    };

    return {
      id: profile.id,
      slug: profile.slug,
      displayName: profile.display_name,
      createdAt: profile.created_at,
      activated: settings.onboarding_completed === true,
      accountStatus: (profile.account_status as string) ?? "active",
      isTester: profile.is_tester ?? false,
      totalBookings: stats.total,
      approvedBookings: stats.approved,
      lastActivity: stats.lastActivity,
      // Defaults match DEFAULT_OVERRIDES for artists with no row yet.
      planTier:
        (overridesByArtist.get(profile.id)?.plan_tier as string) ?? "free",
      planSource:
        (overridesByArtist.get(profile.id)?.plan_source as string | null) ??
        null,
      planExpiresAt:
        (overridesByArtist.get(profile.id)?.plan_expires_at as string | null) ??
        null,
    };
  });
}

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
    pending: allBookings.filter((booking) => booking.status === "pending")
      .length,
    approved: allBookings.filter((booking) => booking.status === "approved")
      .length,
    rejected: allBookings.filter((booking) => booking.status === "rejected")
      .length,
    cancelled: allBookings.filter((booking) => booking.status === "cancelled")
      .length,
  };

  return {
    profile,
    email: authUser?.email ?? null,
    authLastSignIn: authUser?.last_sign_in_at ?? null,
    bookingCounts,
    flashCounts: {
      total: flashItems.length,
      published: flashItems.filter((item) => item.status === "published")
        .length,
    },
    tripCount,
    customFieldCount,
    emailTemplateCount,
    waitlistCount,
    recentBookings,
    adminActions,
    lastActivity: allBookings.length > 0 ? allBookings[0].created_at : null,
  };
}

export async function getIntegrityFlags() {
  const excluded = await testerIds();
  let query = serviceClient
    .from("booking_requests")
    .select(
      "status, decided_at, deposit_amount, deposit_due_at, deposit_paid_at",
    );
  query = excludeArtistsQuery(query, excluded);

  const { data } = await query;
  return buildIntegrityFlags(data ?? [], addDaysToDateKey(localDateKey(), -7));
}
