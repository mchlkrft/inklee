/**
 * Query layer for the public web analytics + Search Console cockpit sections.
 * Server-only, service-role, called behind requireAdmin() page guards.
 * Aggregation happens in the 0070 SQL functions; this module assembles
 * sections and computes previous-period comparisons.
 */

import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { getGrowthContext, type GrowthContext } from "@/lib/growth-queries";
import { dayKeyInTimeZone } from "@/lib/growth/date-range";
import { GSC_AUTH_EXPIRED_ERROR } from "@/lib/gsc/errors";

export { getGrowthContext };

// ---------------------------------------------------------------------------
// Raw RPC wrappers
// ---------------------------------------------------------------------------

export type WaKpis = {
  visitors: number;
  visits: number;
  pageviews: number;
  signup_starts: number;
  signup_completions: number;
  booking_completions: number;
};

export type WaTimeseriesRow = {
  bucket: string;
  visitors: number;
  visits: number;
  pageviews: number;
  signup_completions: number;
  booking_completions: number;
};

export type WaBreakdownRow = {
  dimension_value: string;
  visitors: number;
  visits: number;
  pageviews: number;
  signup_starts: number;
  signup_completions: number;
  booking_completions: number;
};

export type WaCampaignRow = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  visitors: number;
  visits: number;
  signup_starts: number;
  signup_completions: number;
  booking_completions: number;
};

export type WaDimension =
  | "landing_path"
  | "channel"
  | "referrer_domain"
  | "country_code"
  | "device_type"
  | "hostname";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await serviceClient.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data ?? []) as T[];
}

const PAGE_SIZE = 1000;

/** Page a set-returning RPC past the PostgREST max_rows cap. The function must
 *  have a deterministic ORDER BY so Range pages are disjoint. */
async function pagedRpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await serviceClient
      .rpc(fn, args)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${fn}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (offset > 100_000) break; // hard safety stop
  }
  return rows;
}

export async function waKpis(from: Date, to: Date): Promise<WaKpis> {
  const rows = await rpc<WaKpis>("wa_kpis", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  return (
    rows[0] ?? {
      visitors: 0,
      visits: 0,
      pageviews: 0,
      signup_starts: 0,
      signup_completions: 0,
      booking_completions: 0,
    }
  );
}

export async function waTimeseries(
  context: GrowthContext,
): Promise<WaTimeseriesRow[]> {
  return rpc<WaTimeseriesRow>("wa_timeseries", {
    p_from: context.range.from.toISOString(),
    p_to: context.range.to.toISOString(),
    p_tz: context.settings.reporting_timezone,
    p_bucket: context.range.bucket,
  });
}

export async function waBreakdown(
  context: GrowthContext,
  dimension: WaDimension,
  limit = 100,
  offset = 0,
): Promise<WaBreakdownRow[]> {
  return rpc<WaBreakdownRow>("wa_breakdown", {
    p_from: context.range.from.toISOString(),
    p_to: context.range.to.toISOString(),
    p_dimension: dimension,
    p_limit: limit,
    p_offset: offset,
  });
}

export async function waCampaigns(
  context: GrowthContext,
  limit = 100,
  offset = 0,
): Promise<WaCampaignRow[]> {
  return rpc<WaCampaignRow>("wa_campaigns", {
    p_from: context.range.from.toISOString(),
    p_to: context.range.to.toISOString(),
    p_limit: limit,
    p_offset: offset,
  });
}

/** SQL-side ceiling on wa_breakdown/wa_campaigns since migration 0073,
 *  aligned with the users and organic exports' 10k bound. */
export const WA_EXPORT_MAX = 10_000;

/** Full breakdown for CSV export: pages past the PostgREST 1000-row cap up to
 *  the SQL ceiling (both wa_breakdown ORDER BYs are deterministic). */
export async function waBreakdownAll(
  context: GrowthContext,
  dimension: WaDimension,
): Promise<WaBreakdownRow[]> {
  return pagedRpc<WaBreakdownRow>("wa_breakdown", {
    p_from: context.range.from.toISOString(),
    p_to: context.range.to.toISOString(),
    p_dimension: dimension,
    p_limit: WA_EXPORT_MAX,
    p_offset: 0,
  });
}

/** Full campaigns table for CSV export; same paging contract as above. */
export async function waCampaignsAll(
  context: GrowthContext,
): Promise<WaCampaignRow[]> {
  return pagedRpc<WaCampaignRow>("wa_campaigns", {
    p_from: context.range.from.toISOString(),
    p_to: context.range.to.toISOString(),
    p_limit: WA_EXPORT_MAX,
    p_offset: 0,
  });
}

export type WaOrganicRow = {
  landing_path: string;
  visitors: number;
  visits: number;
  signup_starts: number;
  signup_completions: number;
};

export async function waOrganicLanding(
  from: Date,
  to: Date,
): Promise<WaOrganicRow[]> {
  // Paged: one row per organic landing path can exceed the 1000-row cap on a
  // large site; wa_organic_landing has a deterministic ORDER BY.
  return pagedRpc<WaOrganicRow>("wa_organic_landing", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Section assemblies
// ---------------------------------------------------------------------------

/** KPIs with a previous-period comparison (null when no previous window). */
export async function getAcquisitionKpis(context: GrowthContext): Promise<{
  current: WaKpis;
  previous: WaKpis | null;
}> {
  const current = await waKpis(context.range.from, context.range.to);
  const previous =
    context.range.previousFrom && context.range.previousTo
      ? await waKpis(context.range.previousFrom, context.range.previousTo)
      : null;
  return { current, previous };
}

export async function getWaDiagnostics(): Promise<{
  lastEventAt: string | null;
  eventsToday: number;
  rejectionsToday: {
    bot_rejected: number;
    invalid_payload: number;
    internal_rejected: number;
    unsupported_hostname: number;
  } | null;
  collectorConfigured: boolean;
}> {
  const todayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const [lastEvent, todayCount, stats] = await Promise.all([
    serviceClient
      .from("web_analytics_events")
      .select("occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    serviceClient
      .from("web_analytics_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", todayStart),
    serviceClient
      .from("web_analytics_ingest_stats")
      .select(
        "bot_rejected, invalid_payload, internal_rejected, unsupported_hostname",
      )
      .eq("day", new Date().toISOString().slice(0, 10))
      .maybeSingle(),
  ]);
  return {
    lastEventAt: lastEvent.data?.occurred_at ?? null,
    eventsToday: todayCount.count ?? 0,
    rejectionsToday: stats.data ?? null,
    collectorConfigured: Boolean(process.env.WA_VISITOR_HASH_SECRET),
  };
}

// ---------------------------------------------------------------------------
// Search Console reads
// ---------------------------------------------------------------------------

export type GscConnectionState = {
  configured: boolean;
  connected: boolean;
  connectionId: string | null;
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  lastError: string | null;
  /** True when the last sync failed because Google rejected the refresh token
   *  (auth expired). The connection stays "connected" and keeps serving the
   *  last-synced data, so the pages need a reconnect CTA rather than the normal
   *  connected view. */
  needsReconnect: boolean;
  properties: {
    id: string;
    siteUrl: string;
    permissionLevel: string | null;
    isActive: boolean;
  }[];
  activeProperty: { id: string; siteUrl: string } | null;
  latestSourceDate: string | null;
  backfill: {
    status: string;
    fromDate: string;
    toDate: string;
    cursorDate: string;
    datesDone: number;
  } | null;
};

export async function getGscConnectionState(): Promise<GscConnectionState> {
  const configured = Boolean(
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID &&
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET &&
    process.env.GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET,
  );
  const { data: connection } = await serviceClient
    .from("gsc_connections")
    .select(
      "id, connected_at, last_successful_sync_at, last_failed_sync_at, last_error",
    )
    .is("disconnected_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connection) {
    return {
      configured,
      connected: false,
      connectionId: null,
      connectedAt: null,
      lastSuccessfulSyncAt: null,
      lastFailedSyncAt: null,
      lastError: null,
      needsReconnect: false,
      properties: [],
      activeProperty: null,
      latestSourceDate: null,
      backfill: null,
    };
  }

  const { data: properties } = await serviceClient
    .from("gsc_properties")
    .select("id, site_url, permission_level, is_active")
    .eq("connection_id", connection.id)
    .order("site_url");
  const active =
    (properties ?? []).find((property) => property.is_active) ?? null;

  let latestSourceDate: string | null = null;
  let backfill: GscConnectionState["backfill"] = null;
  if (active) {
    const { data: latest } = await serviceClient
      .from("gsc_daily_totals")
      .select("source_date")
      .eq("property_id", active.id)
      .order("source_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestSourceDate = latest?.source_date ?? null;

    const { data: backfillRow } = await serviceClient
      .from("gsc_backfills")
      .select("status, from_date, to_date, cursor_date, dates_done")
      .eq("property_id", active.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (backfillRow) {
      backfill = {
        status: backfillRow.status,
        fromDate: backfillRow.from_date,
        toDate: backfillRow.to_date,
        cursorDate: backfillRow.cursor_date,
        datesDone: backfillRow.dates_done,
      };
    }
  }

  return {
    configured,
    connected: true,
    connectionId: connection.id,
    connectedAt: connection.connected_at,
    lastSuccessfulSyncAt: connection.last_successful_sync_at,
    lastFailedSyncAt: connection.last_failed_sync_at,
    lastError: connection.last_error,
    needsReconnect: connection.last_error === GSC_AUTH_EXPIRED_ERROR,
    properties: (properties ?? []).map((property) => ({
      id: property.id,
      siteUrl: property.site_url,
      permissionLevel: property.permission_level,
      isActive: property.is_active,
    })),
    activeProperty: active ? { id: active.id, siteUrl: active.site_url } : null,
    latestSourceDate,
    backfill,
  };
}

export type GscTotalsRow = {
  source_date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  average_position: number;
};

/** Daily totals for a date-key window (GSC source dates; no tz conversion). */
export async function gscTotalsSeries(
  propertyId: string,
  fromDay: string,
  toDay: string,
): Promise<GscTotalsRow[]> {
  const { data, error } = await serviceClient
    .from("gsc_daily_totals")
    .select("source_date, clicks, impressions, ctr, average_position")
    .eq("property_id", propertyId)
    .eq("search_type", "web")
    .gte("source_date", fromDay)
    .lte("source_date", toDay)
    .order("source_date");
  if (error) throw new Error(`gsc totals: ${error.message}`);
  return (data ?? []) as GscTotalsRow[];
}

export type GscAggRow = {
  dimension_value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  average_position: number;
};

export async function gscDimensionAgg(
  propertyId: string,
  dimensionType: "query" | "page" | "country" | "device",
  fromDay: string,
  toDay: string,
  limit = 250,
  offset = 0,
): Promise<GscAggRow[]> {
  const rows = await rpc<{
    dimension_value: string;
    clicks: number | string;
    impressions: number | string;
    ctr: number;
    average_position: number;
  }>("gsc_dimension_agg", {
    p_property_id: propertyId,
    p_dimension_type: dimensionType,
    p_from: fromDay,
    p_to: toDay,
    p_limit: limit,
    p_offset: offset,
  });
  // bigint sums arrive as strings through PostgREST.
  return rows.map((row) => ({
    dimension_value: row.dimension_value,
    clicks: Number(row.clicks),
    impressions: Number(row.impressions),
    ctr: row.ctr,
    average_position: row.average_position,
  }));
}

/** The GSC-side date window for a cockpit range: source-date keys derived in
 *  the reporting timezone, clamped to the latest synced source date. GSC days
 *  and first-party days are different reporting boundaries; the UI labels
 *  them separately. */
export function gscWindowFor(
  context: GrowthContext,
  latestSourceDate: string | null,
): {
  fromDay: string;
  toDay: string;
  previousFromDay: string;
  previousToDay: string;
} | null {
  if (!latestSourceDate) return null;
  const tz = context.settings.reporting_timezone;
  const toDay = (() => {
    const rangeTo = dayKeyInTimeZone(
      new Date(context.range.to.getTime() - 1),
      tz,
    );
    return rangeTo < latestSourceDate ? rangeTo : latestSourceDate;
  })();
  const fromDay = dayKeyInTimeZone(context.range.from, tz);
  if (fromDay > toDay) return null;
  const spanDays =
    Math.round(
      (new Date(`${toDay}T00:00:00Z`).getTime() -
        new Date(`${fromDay}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  const previousTo = new Date(
    new Date(`${fromDay}T00:00:00Z`).getTime() - 86_400_000,
  );
  const previousFrom = new Date(
    previousTo.getTime() - (spanDays - 1) * 86_400_000,
  );
  return {
    fromDay,
    toDay,
    previousFromDay: previousFrom.toISOString().slice(0, 10),
    previousToDay: previousTo.toISOString().slice(0, 10),
  };
}

/** Normalize a canonical GSC page URL to an Inklee path for the combined
 *  organic landing-pages join. Keeps the source URL intact elsewhere. */
export function gscPageToPath(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    let path = url.pathname;
    path = path.replace(/\/{2,}/g, "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path || "/";
  } catch {
    return null;
  }
}
