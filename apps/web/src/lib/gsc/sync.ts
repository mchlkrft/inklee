/**
 * Google Search Console synchronization engine. Idempotent (primary-key
 * upserts), resumable (per-date processing with stored backfill cursors),
 * lock-guarded against overlapping runs, and partial-failure safe: a failed
 * dimension request for one date never removes previously synced data.
 *
 * GSC dates are SOURCE dates (Google's reporting days), stored as plain dates
 * and never converted through timezones. Finalized data lags ~2-3 days; the
 * daily sync re-fetches a rolling window so late-final data self-corrects.
 */

import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { GSC_AUTH_EXPIRED_ERROR } from "./errors";
import { decryptToken } from "./crypto";
import {
  querySearchAnalytics,
  refreshAccessToken,
  type GscRow,
} from "./client";

export const ROLLING_WINDOW_DAYS = 10;
/** Google finalizes data about this many days behind today. */
const FINALIZATION_LAG_DAYS = 3;
const DIMENSION_TYPES = ["query", "page", "country", "device"] as const;
const SYNC_LOCK_STALE_MINUTES = 15;
/** Dates processed per backfill step (bounded to fit a function invocation). */
export const BACKFILL_BATCH_DATES = 14;

export type ActiveTarget = {
  connectionId: string;
  propertyId: string;
  siteUrl: string;
  refreshToken: string;
};

export async function getActiveTarget(): Promise<ActiveTarget | null> {
  const { data: connection } = await serviceClient
    .from("gsc_connections")
    .select("id, encrypted_refresh_token")
    .is("disconnected_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!connection) return null;
  const { data: property } = await serviceClient
    .from("gsc_properties")
    .select("id, site_url")
    .eq("connection_id", connection.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!property) return null;
  return {
    connectionId: connection.id,
    propertyId: property.id,
    siteUrl: property.site_url,
    refreshToken: decryptToken(connection.encrypted_refresh_token),
  };
}

/** Latest finalized GSC source date (UTC today minus the finalization lag). */
export function latestFinalizedDate(now: Date = new Date()): string {
  return new Date(now.getTime() - FINALIZATION_LAG_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function dateRange(endDate: string, days: number): string[] {
  const end = new Date(`${endDate}T00:00:00Z`);
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(
      new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10),
    );
  }
  return dates;
}

/** Take the sync lock (update-if-free/stale). Returns false when another run
 *  holds it. */
async function acquireLock(connectionId: string): Promise<boolean> {
  const staleBefore = new Date(
    Date.now() - SYNC_LOCK_STALE_MINUTES * 60_000,
  ).toISOString();
  const { data } = await serviceClient
    .from("gsc_connections")
    .update({ sync_locked_at: new Date().toISOString() })
    .eq("id", connectionId)
    .or(`sync_locked_at.is.null,sync_locked_at.lt.${staleBefore}`)
    .select("id");
  return (data ?? []).length > 0;
}

async function releaseLock(connectionId: string): Promise<void> {
  await serviceClient
    .from("gsc_connections")
    .update({ sync_locked_at: null })
    .eq("id", connectionId);
}

function totalsRowFrom(rows: GscRow[]): {
  clicks: number;
  impressions: number;
  ctr: number;
  average_position: number;
} {
  const row = rows[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    average_position: row?.position ?? 0,
  };
}

export type DateSyncResult = {
  date: string;
  totalsUpserted: boolean;
  dimensionRows: number;
  failedDimensions: string[];
};

/** Sync ONE source date: totals + the four dimension breakdowns. Upserts are
 *  keyed on the primary keys, so re-running a date is a no-op update. */
export async function syncDate(
  target: ActiveTarget,
  accessToken: string,
  date: string,
): Promise<DateSyncResult> {
  const result: DateSyncResult = {
    date,
    totalsUpserted: false,
    dimensionRows: 0,
    failedDimensions: [],
  };

  try {
    const totals = await querySearchAnalytics({
      accessToken,
      siteUrl: target.siteUrl,
      startDate: date,
      endDate: date,
      dimensions: [],
    });
    const { error } = await serviceClient.from("gsc_daily_totals").upsert(
      {
        property_id: target.propertyId,
        source_date: date,
        search_type: "web",
        ...totalsRowFrom(totals),
        synced_at: new Date().toISOString(),
      },
      { onConflict: "property_id,source_date,search_type" },
    );
    if (error) throw new Error(error.message);
    result.totalsUpserted = true;
  } catch {
    result.failedDimensions.push("totals");
  }

  for (const dimensionType of DIMENSION_TYPES) {
    try {
      const rows = await querySearchAnalytics({
        accessToken,
        siteUrl: target.siteUrl,
        startDate: date,
        endDate: date,
        dimensions: [dimensionType],
      });
      if (rows.length === 0) continue;
      // Chunked upserts (PostgREST payload bounds).
      for (let index = 0; index < rows.length; index += 500) {
        const chunk = rows.slice(index, index + 500).map((row) => ({
          property_id: target.propertyId,
          source_date: date,
          search_type: "web",
          dimension_type: dimensionType,
          dimension_value: (row.keys?.[0] ?? "").slice(0, 2000),
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          average_position: row.position,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await serviceClient
          .from("gsc_daily_dimensions")
          .upsert(chunk, {
            onConflict:
              "property_id,source_date,search_type,dimension_type,dimension_value",
          });
        if (error) throw new Error(error.message);
        result.dimensionRows += chunk.length;
      }
    } catch {
      result.failedDimensions.push(dimensionType);
    }
  }

  return result;
}

export type SyncRunSummary = {
  ok: boolean;
  datesProcessed: number;
  dimensionRows: number;
  failures: string[];
  backfill?: { status: string; cursorDate: string; datesDone: number } | null;
};

/**
 * One scheduled run: refresh the access token, re-sync the rolling recent
 * window, then advance any running backfill by one bounded batch.
 */
export async function runScheduledSync(): Promise<
  SyncRunSummary | { skipped: string }
> {
  const target = await getActiveTarget();
  if (!target)
    return { skipped: "No active Search Console connection/property." };

  if (!(await acquireLock(target.connectionId))) {
    return { skipped: "Another sync run holds the lock." };
  }

  const summary: SyncRunSummary = {
    ok: true,
    datesProcessed: 0,
    dimensionRows: 0,
    failures: [],
    backfill: null,
  };

  try {
    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(target.refreshToken);
    } catch (err) {
      const authExpired = (err as Error & { authExpired?: boolean })
        .authExpired;
      await serviceClient
        .from("gsc_connections")
        .update({
          last_failed_sync_at: new Date().toISOString(),
          last_error: authExpired
            ? GSC_AUTH_EXPIRED_ERROR
            : (err as Error).message,
        })
        .eq("id", target.connectionId);
      return { ...summary, ok: false, failures: [(err as Error).message] };
    }

    // Rolling recent window (late-finalizing data self-corrects).
    const windowDates = dateRange(latestFinalizedDate(), ROLLING_WINDOW_DAYS);
    for (const date of windowDates) {
      const dateResult = await syncDate(target, accessToken, date);
      summary.datesProcessed++;
      summary.dimensionRows += dateResult.dimensionRows;
      if (dateResult.failedDimensions.length > 0) {
        summary.failures.push(
          `${date}: ${dateResult.failedDimensions.join(",")}`,
        );
      }
    }

    // Advance a running backfill by one bounded batch (resumable).
    const { data: backfill } = await serviceClient
      .from("gsc_backfills")
      .select("id, from_date, cursor_date, dates_done")
      .eq("property_id", target.propertyId)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (backfill) {
      let cursor = backfill.cursor_date as string;
      let done = backfill.dates_done as number;
      for (
        let step = 0;
        step < BACKFILL_BATCH_DATES && cursor >= backfill.from_date;
        step++
      ) {
        const dateResult = await syncDate(target, accessToken, cursor);
        summary.dimensionRows += dateResult.dimensionRows;
        if (dateResult.failedDimensions.length > 0) {
          summary.failures.push(
            `backfill ${cursor}: ${dateResult.failedDimensions.join(",")}`,
          );
        }
        done++;
        cursor = new Date(
          new Date(`${cursor}T00:00:00Z`).getTime() - 86_400_000,
        )
          .toISOString()
          .slice(0, 10);
      }
      const finished = cursor < backfill.from_date;
      await serviceClient
        .from("gsc_backfills")
        .update({
          cursor_date: cursor,
          dates_done: done,
          status: finished ? "completed" : "running",
          updated_at: new Date().toISOString(),
        })
        .eq("id", backfill.id);
      summary.backfill = {
        status: finished ? "completed" : "running",
        cursorDate: cursor,
        datesDone: done,
      };
    }

    summary.ok = summary.failures.length === 0;
    await serviceClient
      .from("gsc_connections")
      .update(
        summary.ok
          ? {
              last_successful_sync_at: new Date().toISOString(),
              last_error: null,
            }
          : {
              // A run with failures must NOT advance last_successful_sync_at,
              // or the status card reports a healthy sync that partly failed.
              last_failed_sync_at: new Date().toISOString(),
              last_error: summary.failures.slice(0, 3).join(" | "),
            },
      )
      .eq("id", target.connectionId);

    return summary;
  } finally {
    await releaseLock(target.connectionId);
  }
}
