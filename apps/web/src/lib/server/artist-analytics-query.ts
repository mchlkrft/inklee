import { serviceClient } from "@/lib/supabase/service";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { canSeeAdvancedAnalytics } from "@/lib/server/entitlement-gates";
import {
  computeHubMetrics,
  computeDailyMetrics,
  computeTopLinks,
  hubAnalyticsCutoffIso,
  type HubAnalyticsRange,
  type ArtistAnalyticsResult,
  type ArtistPageRollup,
  type SourceBreakdown,
} from "@inklee/shared/artist-analytics";

export async function getArtistHubAnalytics(
  artistId: string,
  range: HubAnalyticsRange = "30",
): Promise<ArtistAnalyticsResult | null> {
  const overrides = await getAccountOverrides(artistId);
  if (!canSeeAdvancedAnalytics(overrides)) return null;

  const cutoff = hubAnalyticsCutoffIso(range);
  let query = serviceClient
    .from("artist_page_rollups")
    .select("*")
    .eq("artist_id", artistId)
    .order("roll_date", { ascending: true });

  if (cutoff) {
    query = query.gte("roll_date", cutoff.slice(0, 10));
  }

  const { data, error } = await query;
  if (error || !data) return null;

  const rollups = data as ArtistPageRollup[];
  const hub = computeHubMetrics(rollups.filter((r) => r.surface === "hub"));
  const daily = computeDailyMetrics(rollups.filter((r) => r.surface === "hub"));
  const topLinks = computeTopLinks(rollups);
  const sources = computeSourceBreakdown(artistId, range);

  const from = cutoff ? cutoff.slice(0, 10) : (rollups[0]?.roll_date ?? "");
  const to = rollups.length
    ? rollups[rollups.length - 1].roll_date
    : new Date().toISOString().slice(0, 10);

  return {
    hub,
    sources: await sources,
    daily,
    topLinks,
    period: { from, to },
  };
}

async function computeSourceBreakdown(
  artistId: string,
  range: HubAnalyticsRange,
): Promise<SourceBreakdown[]> {
  const cutoff = hubAnalyticsCutoffIso(range);

  let query = serviceClient
    .from("artist_page_events")
    .select("channel, visitor_hash")
    .eq("artist_id", artistId)
    .eq("event", "link_click");

  if (cutoff) {
    query = query.gte("occurred_at", cutoff);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const byChannel = new Map<string, Set<string>>();
  for (const ev of data) {
    const ch = (ev.channel as string) ?? "direct";
    if (!byChannel.has(ch)) byChannel.set(ch, new Set());
    if (ev.visitor_hash) byChannel.get(ch)!.add(ev.visitor_hash as string);
  }

  const total = data.length;
  return [...byChannel.entries()]
    .map(([channel, visitors]) => ({
      channel,
      pageViews: data.filter((e) => (e.channel ?? "direct") === channel).length,
      uniqueVisitors: visitors.size,
      percentage:
        total > 0
          ? (data.filter((e) => (e.channel ?? "direct") === channel).length /
              total) *
            100
          : 0,
    }))
    .sort((a, b) => b.pageViews - a.pageViews);
}
