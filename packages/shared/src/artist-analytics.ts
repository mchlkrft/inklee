// P6 Linkhub analytics — artist-keyed page performance metrics.
//
// Pure + dependency-free. Shared between:
//   - web analytics page (apps/web/src/app/(artist)/analytics/)
//   - mobile analytics route (apps/web/src/app/api/mobile/analytics/)
//   - rollup cron (daily aggregation)
//
// The ACQUISITION collector (web_analytics_events, 0070) is anonymous and
// founder-facing. This plane is artist-keyed and artist-facing, gated by
// canSeeAdvancedAnalytics (Plus only, Free = none).

// ---------------------------------------------------------------------------
// Types mirroring the 0130 schema
// ---------------------------------------------------------------------------

export type ArtistPageSurface =
  | "hub"
  | "booking_form"
  | "shop"
  | "large_project"
  | "pay";

export type ArtistPageEventType =
  | "page_view"
  | "link_click"
  | "block_click"
  | "booking_submitted"
  | "goods_order_completed";

export type ArtistPageEvent = {
  id: string;
  artist_id: string;
  surface: ArtistPageSurface;
  event: ArtistPageEventType;
  target_key: string | null;
  visitor_hash: string | null;
  channel: string | null;
  referrer_domain: string | null;
  occurred_at: string;
  properties: Record<string, unknown>;
};

export type ArtistPageRollup = {
  id: string;
  artist_id: string;
  roll_date: string;
  surface: ArtistPageSurface;
  event: ArtistPageEventType;
  target_key: string | null;
  event_count: number;
  unique_visitors: number;
};

// ---------------------------------------------------------------------------
// Artist analytics event registry (client-side allowlist)
// ---------------------------------------------------------------------------

export type ArtistEventDefinition = {
  description: string;
  clientEmittable: boolean;
  requiresTargetKey: boolean;
};

export const ARTIST_EVENTS: Record<string, ArtistEventDefinition> = {
  link_click: {
    description: "A link on the artist hub was clicked.",
    clientEmittable: true,
    requiresTargetKey: true,
  },
  block_click: {
    description: "A feature block on the artist hub was interacted with.",
    clientEmittable: true,
    requiresTargetKey: true,
  },
} as const;

export type ArtistEventName = keyof typeof ARTIST_EVENTS;

export function isClientEmittableArtistEvent(name: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(ARTIST_EVENTS, name) &&
    ARTIST_EVENTS[name].clientEmittable
  );
}

// ---------------------------------------------------------------------------
// Rollup aggregation (pure, used by the daily cron)
// ---------------------------------------------------------------------------

export type RollupRow = {
  artist_id: string;
  roll_date: string;
  surface: ArtistPageSurface;
  event: ArtistPageEventType;
  target_key: string | null;
  event_count: number;
  unique_visitors: number;
};

// ---------------------------------------------------------------------------
// Analytics computation (artist-facing read layer)
// ---------------------------------------------------------------------------

export type HubMetrics = {
  pageViews: number;
  uniqueVisitors: number;
  linkClicks: number;
  blockClicks: number;
  clickThroughRate: number;
  bookingConversions: number;
  goodsConversions: number;
  conversionRate: number;
};

export type SourceBreakdown = {
  channel: string;
  pageViews: number;
  uniqueVisitors: number;
  percentage: number;
};

export type DailyMetric = {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  linkClicks: number;
};

export type LinkPerformance = {
  targetKey: string;
  clicks: number;
  uniqueClickers: number;
};

export type ArtistAnalyticsResult = {
  hub: HubMetrics;
  sources: SourceBreakdown[];
  daily: DailyMetric[];
  topLinks: LinkPerformance[];
  period: { from: string; to: string };
};

export function computeHubMetrics(rollups: ArtistPageRollup[]): HubMetrics {
  let pageViews = 0;
  let uniqueVisitors = 0;
  let linkClicks = 0;
  let blockClicks = 0;
  let bookingConversions = 0;
  let goodsConversions = 0;

  for (const r of rollups) {
    switch (r.event) {
      case "page_view":
        pageViews += r.event_count;
        uniqueVisitors += r.unique_visitors;
        break;
      case "link_click":
        linkClicks += r.event_count;
        break;
      case "block_click":
        blockClicks += r.event_count;
        break;
      case "booking_submitted":
        bookingConversions += r.event_count;
        break;
      case "goods_order_completed":
        goodsConversions += r.event_count;
        break;
    }
  }

  const totalClicks = linkClicks + blockClicks;
  return {
    pageViews,
    uniqueVisitors,
    linkClicks,
    blockClicks,
    clickThroughRate: pageViews > 0 ? (totalClicks / pageViews) * 100 : 0,
    bookingConversions,
    goodsConversions,
    conversionRate:
      uniqueVisitors > 0
        ? ((bookingConversions + goodsConversions) / uniqueVisitors) * 100
        : 0,
  };
}

export function computeDailyMetrics(rollups: ArtistPageRollup[]): DailyMetric[] {
  const byDate = new Map<
    string,
    { pageViews: number; uniqueVisitors: number; linkClicks: number }
  >();

  for (const r of rollups) {
    const existing = byDate.get(r.roll_date) ?? {
      pageViews: 0,
      uniqueVisitors: 0,
      linkClicks: 0,
    };
    if (r.event === "page_view") {
      existing.pageViews += r.event_count;
      existing.uniqueVisitors += r.unique_visitors;
    } else if (r.event === "link_click") {
      existing.linkClicks += r.event_count;
    }
    byDate.set(r.roll_date, existing);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, m]) => ({ date, ...m }));
}

export function computeTopLinks(rollups: ArtistPageRollup[]): LinkPerformance[] {
  const linkRollups = rollups.filter(
    (r) => r.event === "link_click" && r.target_key,
  );
  const byTarget = new Map<string, { clicks: number; uniqueClickers: number }>();

  for (const r of linkRollups) {
    const key = r.target_key!;
    const existing = byTarget.get(key) ?? { clicks: 0, uniqueClickers: 0 };
    existing.clicks += r.event_count;
    existing.uniqueClickers += r.unique_visitors;
    byTarget.set(key, existing);
  }

  return [...byTarget.entries()]
    .sort(([, a], [, b]) => b.clicks - a.clicks)
    .slice(0, 20)
    .map(([targetKey, m]) => ({ targetKey, ...m }));
}

export type HubAnalyticsRange = "30" | "90" | "365" | "all";

export function hubAnalyticsCutoffIso(
  range: HubAnalyticsRange,
  now: number = Date.now(),
): string | null {
  const days =
    range === "30" ? 30 : range === "90" ? 90 : range === "365" ? 365 : null;
  return days === null ? null : new Date(now - days * 86_400_000).toISOString();
}
