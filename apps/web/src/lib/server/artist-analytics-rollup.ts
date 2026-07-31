import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  extractArtistSlug,
  resolveArtistSlug,
} from "@/lib/public-analytics/artist-slug-resolver";
import type {
  ArtistPageSurface,
  ArtistPageEventType,
} from "@inklee/shared/artist-analytics";

export type RollupResult = {
  date: string;
  artistsProcessed: number;
  rowsWritten: number;
  errors: number;
};

type AggKey = `${string}|${ArtistPageSurface}|${ArtistPageEventType}|${string}`;

function aggKey(
  artistId: string,
  surface: ArtistPageSurface,
  event: ArtistPageEventType,
  targetKey: string | null,
): AggKey {
  return `${artistId}|${surface}|${event}|${targetKey ?? ""}` as AggKey;
}

export async function runArtistAnalyticsRollup(
  dateStr?: string,
): Promise<RollupResult> {
  const result: RollupResult = {
    date: "",
    artistsProcessed: 0,
    rowsWritten: 0,
    errors: 0,
  };

  const rollDate = dateStr ?? yesterdayIso();
  result.date = rollDate;
  const dayStart = `${rollDate}T00:00:00Z`;
  const dayEnd = `${rollDate}T23:59:59.999Z`;

  const agg = new Map<
    AggKey,
    {
      artistId: string;
      surface: ArtistPageSurface;
      event: ArtistPageEventType;
      targetKey: string | null;
      count: number;
      visitors: Set<string>;
    }
  >();

  function bump(
    artistId: string,
    surface: ArtistPageSurface,
    event: ArtistPageEventType,
    targetKey: string | null,
    visitorHash: string | null,
  ) {
    const key = aggKey(artistId, surface, event, targetKey);
    const existing = agg.get(key) ?? {
      artistId,
      surface,
      event,
      targetKey,
      count: 0,
      visitors: new Set<string>(),
    };
    existing.count++;
    if (visitorHash) existing.visitors.add(visitorHash);
    agg.set(key, existing);
  }

  // 1. Pageviews from web_analytics_events
  try {
    const { data: waEvents, error } = await serviceClient
      .from("web_analytics_events")
      .select("pathname, hostname, visitor_day_hash")
      .eq("event_name", "pageview")
      .gte("occurred_at", dayStart)
      .lte("occurred_at", dayEnd);

    if (error) {
      Sentry.captureException(error, {
        tags: { action: "artist_rollup_wa_fetch" },
      });
      result.errors++;
    } else if (waEvents) {
      for (const ev of waEvents) {
        const resolved = extractArtistSlug(
          ev.pathname as string,
          ev.hostname as string,
        );
        if (!resolved) continue;

        const artistId = await resolveArtistSlug(resolved.slug);
        if (!artistId) continue;

        bump(
          artistId,
          resolved.surface as ArtistPageSurface,
          "page_view",
          null,
          ev.visitor_day_hash as string,
        );
      }
    }
  } catch (e) {
    Sentry.captureException(e, { tags: { action: "artist_rollup_wa" } });
    result.errors++;
  }

  // 2. Click events from artist_page_events
  try {
    const { data: clickEvents, error } = await serviceClient
      .from("artist_page_events")
      .select("artist_id, surface, event, target_key, visitor_hash")
      .gte("occurred_at", dayStart)
      .lte("occurred_at", dayEnd);

    if (error) {
      Sentry.captureException(error, {
        tags: { action: "artist_rollup_clicks_fetch" },
      });
      result.errors++;
    } else if (clickEvents) {
      for (const ev of clickEvents) {
        bump(
          ev.artist_id as string,
          ev.surface as ArtistPageSurface,
          ev.event as ArtistPageEventType,
          (ev.target_key as string) ?? null,
          (ev.visitor_hash as string) ?? null,
        );
      }
    }
  } catch (e) {
    Sentry.captureException(e, { tags: { action: "artist_rollup_clicks" } });
    result.errors++;
  }

  // 3. Booking conversions from booking_requests
  try {
    const { data: bookings, error } = await serviceClient
      .from("booking_requests")
      .select("artist_id")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .not("status", "in", "(cancelled)");

    if (error) {
      Sentry.captureException(error, {
        tags: { action: "artist_rollup_bookings_fetch" },
      });
      result.errors++;
    } else if (bookings) {
      for (const b of bookings) {
        bump(
          b.artist_id as string,
          "booking_form",
          "booking_submitted",
          null,
          null,
        );
      }
    }
  } catch (e) {
    Sentry.captureException(e, { tags: { action: "artist_rollup_bookings" } });
    result.errors++;
  }

  // 4. Goods conversions from orders
  try {
    const { data: orders, error } = await serviceClient
      .from("orders")
      .select("artist_id")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .eq("status", "paid");

    if (error) {
      Sentry.captureException(error, {
        tags: { action: "artist_rollup_orders_fetch" },
      });
      result.errors++;
    } else if (orders) {
      for (const o of orders) {
        bump(
          o.artist_id as string,
          "shop",
          "goods_order_completed",
          null,
          null,
        );
      }
    }
  } catch (e) {
    Sentry.captureException(e, { tags: { action: "artist_rollup_orders" } });
    result.errors++;
  }

  // 5. Upsert aggregated rows into artist_page_rollups
  const artists = new Set<string>();
  for (const entry of agg.values()) {
    artists.add(entry.artistId);
    try {
      const { error } = await serviceClient.from("artist_page_rollups").upsert(
        {
          artist_id: entry.artistId,
          roll_date: rollDate,
          surface: entry.surface,
          event: entry.event,
          target_key: entry.targetKey,
          event_count: entry.count,
          unique_visitors: entry.visitors.size,
        },
        { onConflict: "artist_id,roll_date,surface,event,target_key" },
      );

      if (error) {
        Sentry.captureException(error, {
          tags: { action: "artist_rollup_upsert" },
          extra: { artistId: entry.artistId, surface: entry.surface },
        });
        result.errors++;
      } else {
        result.rowsWritten++;
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { action: "artist_rollup_upsert" } });
      result.errors++;
    }
  }

  result.artistsProcessed = artists.size;

  // 6. Purge raw click events older than 13 months
  try {
    const purgeDate = new Date(
      Date.now() - 13 * 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { error } = await serviceClient
      .from("artist_page_events")
      .delete()
      .lt("occurred_at", purgeDate);

    if (error) {
      Sentry.captureException(error, {
        tags: { action: "artist_rollup_purge" },
      });
    }
  } catch (e) {
    Sentry.captureException(e, { tags: { action: "artist_rollup_purge" } });
  }

  return result;
}

function yesterdayIso(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
