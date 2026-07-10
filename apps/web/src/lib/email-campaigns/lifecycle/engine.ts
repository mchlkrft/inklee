// The lifecycle email engine (Email hub slice 11). Runs every 'active' definition against
// its state-based audience segment and sends each qualifying artist the email AT MOST ONCE,
// ever. Called only by the daily cron (/api/cron/lifecycle) behind CRON_SECRET and the
// EMAIL_LIFECYCLE_ENABLED kill switch.
//
// SAFETY (belt and braces): the engine re-checks EMAIL_LIFECYCLE_ENABLED itself and returns
// without touching the database when the flag is not exactly 'true', so a send is impossible
// even if some future caller forgets the gate. Draft definitions never run. The at-most-once
// guarantee is the DB UNIQUE on email_lifecycle_markers(definition_key, artist_id, period_key)
// with insert-BEFORE-send: a crash between insert and send leaves a stuck 'pending' marker
// that blocks the artist for that definition — a missed nudge, never a double-send.
//
// Gate stack per artist, in order (each counted in skipped_detail):
//   1. no_email      — auth admin lookup returned no address
//   2. suppressed    — hard bounce/complaint in email_suppressions (overrides everything)
//   3. opted_out     — profiles.settings.email_prefs.lifecycle === false
//   4. throttled     — ANY lifecycle marker for this artist within def.throttleDays (global gate)
//   5. already_sent  — an existing marker for (def.key, artist, 'once'); re-checked by the
//                      UNIQUE insert, so a race still cannot double-send
//   6. capped        — beyond LIFECYCLE_RUN_CAP survivors this run (picked up next run)
// is_tester artists never reach the engine — the segment resolver excludes them.
//
// One email_lifecycle_runs row is written per definition per run (aggregates only). Nothing
// here ever logs a recipient email address.
import "server-only";
import { randomUUID } from "crypto";
import { Resend } from "resend";
import { serviceClient } from "@/lib/supabase/service";
import {
  resolveSegmentArtists,
  fetchAllRows,
  KNOWN,
  type SegmentArtist,
} from "@/lib/email-campaigns/resolve-segment";
import { isOptedOut } from "@/lib/email-campaigns/preferences";
import { resolveRecipientMeta } from "@/lib/email-campaigns/recipients";
import {
  buildRecipientMessage,
  type ResendMessage,
} from "@/lib/email-campaigns/messaging";
import { LIFECYCLE_DEFINITIONS } from "./definitions";
import type { LifecycleDefinition } from "./types";

// Per-run circuit breaker: at most this many sends per definition per cron run. Survivors
// beyond the cap are counted as skipped.capped and picked up by the next daily run.
const LIFECYCLE_RUN_CAP = 200;
const BATCH_SIZE = 100; // Resend batch API cap
const BATCH_PACING_MS = 500; // stay under Resend's ~2 req/s default
const MARKER_INSERT_CHUNK = 200; // bulk marker upsert size
// Marker scans feed the throttle + already-sent EXCLUSION sets, so like the resolver's child
// scans they must page to completion — a truncated set would under-throttle or re-send.
const MARKER_SCAN_CAP = 100_000;
const DAY_MS = 86_400_000;

type SkippedDetail = {
  no_email: number;
  suppressed: number;
  opted_out: number;
  throttled: number;
  already_sent: number;
  capped: number;
};

export type RunSummary = {
  definitionKey: string;
  status: "completed" | "failed";
  audienceSize: number;
  eligible: number; // survivors after all filters, BEFORE the per-run cap
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  skipped: SkippedDetail;
  error: string | null;
};

const zeroSkipped = (): SkippedDetail => ({
  no_email: 0,
  suppressed: 0,
  opted_out: 0,
  throttled: 0,
  already_sent: 0,
  capped: 0,
});

const sumSkipped = (s: SkippedDetail): number =>
  s.no_email +
  s.suppressed +
  s.opted_out +
  s.throttled +
  s.already_sent +
  s.capped;

/** Write the per-definition run row (aggregates only). Throws only on insert failure. */
async function insertRunRow(summary: RunSummary): Promise<void> {
  const { error } = await serviceClient.from("email_lifecycle_runs").insert({
    definition_key: summary.definitionKey,
    status: summary.status,
    audience_size: summary.audienceSize,
    eligible: summary.eligible,
    sent_count: summary.sentCount,
    failed_count: summary.failedCount,
    skipped_count: summary.skippedCount,
    skipped_detail: summary.skipped,
    error: summary.error,
    completed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** A failed run: record the row (best-effort) and return the failed summary. */
async function failRun(
  def: LifecycleDefinition,
  message: string,
  partial?: Partial<RunSummary>,
): Promise<RunSummary> {
  const summary: RunSummary = {
    definitionKey: def.key,
    status: "failed",
    audienceSize: 0,
    eligible: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    skipped: zeroSkipped(),
    error: message,
    ...partial,
  };
  try {
    await insertRunRow(summary);
  } catch {
    // swallow — never mask the original failure with a bookkeeping one
  }
  return summary;
}

async function updateMarker(
  markerId: string,
  patch: Record<string, string>,
): Promise<void> {
  await serviceClient
    .from("email_lifecycle_markers")
    .update(patch)
    .eq("id", markerId);
}

async function runDefinition(def: LifecycleDefinition): Promise<RunSummary> {
  try {
    // A real provider is required BEFORE any work: an active run without a key must fail
    // loudly, never "complete" with zero sends.
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return failRun(def, "RESEND_API_KEY is not set");
    }
    // Same fail-closed rule for the compliance footer's physical postal address: without it
    // every message would violate CAN-SPAM, so the run refuses before touching any marker
    // (buildRecipientMessage would throw anyway; this check gives the run row a clear error).
    if (!process.env.EMAIL_POSTAL_ADDRESS) {
      return failRun(def, "EMAIL_POSTAL_ADDRESS is not set");
    }
    if (!KNOWN.has(def.audienceKey)) {
      return failRun(def, `unknown audience key: ${def.audienceKey}`);
    }

    // (a) who currently qualifies — the same resolver the campaign path uses (non-tester only)
    const artists: SegmentArtist[] = await resolveSegmentArtists(
      def.audienceKey,
    );
    const audienceSize = artists.length;
    const skipped = zeroSkipped();

    // (b)(c) profile meta ({{artist_name}} + opt-out settings), emails, and the suppression
    // set via the shared resolver (lib/email-campaigns/recipients), the single implementation
    // this engine and the campaign route both use. A query failure throws into the outer
    // catch (run failed) — an incomplete suppression set must never let a send proceed.
    const { profileMeta, artistEmail, suppressed } =
      await resolveRecipientMeta(artists);

    // (d) global throttle: artists with ANY lifecycle marker (any definition, any status —
    // even a failed attempt counts as recent contact) newer than def.throttleDays. One paged
    // query per run; paged to completion because a truncated set would under-throttle.
    const cutoff = new Date(
      Date.now() - def.throttleDays * DAY_MS,
    ).toISOString();
    const throttleRows = (await fetchAllRows(
      () =>
        serviceClient
          .from("email_lifecycle_markers")
          .select("artist_id")
          .gte("created_at", cutoff),
      MARKER_SCAN_CAP,
    )) as { artist_id: string | null }[];
    const throttled = new Set(
      throttleRows.map((r) => r.artist_id).filter(Boolean),
    );

    // already-sent prefetch for THIS definition (any status: 'pending' and 'failed' block
    // too — at most one ATTEMPT per artist, by design). The UNIQUE insert below re-checks,
    // so this prefetch only exists to count accurately and to keep cap slots for artists
    // who can actually receive the send.
    const markerRows = (await fetchAllRows(
      () =>
        serviceClient
          .from("email_lifecycle_markers")
          .select("artist_id")
          .eq("definition_key", def.key)
          .eq("period_key", "once"),
      MARKER_SCAN_CAP,
    )) as { artist_id: string | null }[];
    const alreadySent = new Set(
      markerRows.map((r) => r.artist_id).filter(Boolean),
    );

    // (e) filter (gate order documented at the top of this file)
    const eligible: {
      artistId: string;
      email: string;
      slug: string | null;
      displayName: string;
    }[] = [];
    for (const a of artists) {
      const email = artistEmail.get(a.id) ?? null;
      const meta = profileMeta.get(a.id);
      if (!email) {
        skipped.no_email++;
      } else if (suppressed.has(email)) {
        // suppression overrides everything, including opt-in
        skipped.suppressed++;
      } else if (isOptedOut(meta?.settings ?? {}, "lifecycle")) {
        skipped.opted_out++;
      } else if (throttled.has(a.id)) {
        skipped.throttled++;
      } else if (alreadySent.has(a.id)) {
        skipped.already_sent++;
      } else {
        eligible.push({
          artistId: a.id,
          email,
          slug: a.slug,
          displayName: meta?.displayName ?? "there",
        });
      }
    }
    const eligibleCount = eligible.length;

    // (f) per-run cap — the overflow is picked up by the next daily run
    skipped.capped = Math.max(0, eligibleCount - LIFECYCLE_RUN_CAP);
    const survivors = eligible.slice(0, LIFECYCLE_RUN_CAP);

    // (g) insert-before-send: chunked UPSERT with ignoreDuplicates + .select() readback.
    // Chosen over row-by-row inserts for one round trip per 200 rows while still learning
    // exactly which rows landed: with ignore-duplicates, .select() returns ONLY the freshly
    // inserted rows, so a survivor missing from the readback hit the UNIQUE (a marker landed
    // in a previous run after our prefetch) and is dropped as already_sent — never re-sent.
    // Client-generated ids let us update markers after the send without a positional read.
    const pending: {
      markerId: string;
      artistId: string;
      email: string;
      slug: string | null;
      displayName: string;
    }[] = [];
    for (let i = 0; i < survivors.length; i += MARKER_INSERT_CHUNK) {
      const chunk = survivors.slice(i, i + MARKER_INSERT_CHUNK);
      const rows = chunk.map((s) => ({
        id: randomUUID(),
        definition_key: def.key,
        artist_id: s.artistId,
        period_key: "once",
        status: "pending",
      }));
      const { data, error } = await serviceClient
        .from("email_lifecycle_markers")
        .upsert(rows, {
          onConflict: "definition_key,artist_id,period_key",
          ignoreDuplicates: true,
        })
        .select("id, artist_id");
      if (error) throw error; // real infra failure -> run failed (outer catch)
      const landed = new Map(
        ((data ?? []) as { id: string; artist_id: string }[]).map((r) => [
          r.artist_id,
          r.id,
        ]),
      );
      for (const s of chunk) {
        const markerId = landed.get(s.artistId);
        if (!markerId) {
          skipped.already_sent++;
          continue;
        }
        pending.push({ markerId, ...s });
      }
    }

    // (h) send in Resend batches of <=100 with pacing; one personalized message per
    // recipient via the shared compliance-critical constructor. The idempotency key is
    // derived from the batch's first marker id (marker ids are minted per run, so a
    // provider-level retry of the same call is deduped, and a later run can never collide).
    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM ?? "inklee <noreply@inklee.app>";
    let sentCount = 0;
    let failedCount = 0;

    for (let c = 0; c * BATCH_SIZE < pending.length; c++) {
      if (c > 0) {
        await new Promise((r) => setTimeout(r, BATCH_PACING_MS));
      }
      const chunk = pending.slice(c * BATCH_SIZE, (c + 1) * BATCH_SIZE);
      const messages: ResendMessage[] = [];
      for (const p of chunk) {
        messages.push(
          await buildRecipientMessage({
            from,
            email: p.email,
            displayName: p.displayName,
            slug: p.slug,
            artistId: p.artistId,
            subjectTpl: def.subject,
            htmlTpl: def.html,
            textTpl: def.text,
          }),
        );
      }

      // (i) per-recipient outcomes are best-effort: a batch failure marks its markers
      // 'failed' and moves on (those artists are never retried — at-most-one attempt).
      try {
        const { data, error } = await resend.batch.send(messages, {
          idempotencyKey: `lifecycle:${def.key}:${chunk[0].markerId}`,
        });
        if (error || !data) {
          for (const p of chunk) {
            await updateMarker(p.markerId, {
              status: "failed",
              error: error?.message ?? "batch send failed",
            });
            failedCount++;
          }
          continue;
        }
        const results = data.data ?? [];
        for (let i = 0; i < chunk.length; i++) {
          const messageId = results[i]?.id ?? null;
          if (messageId) {
            await updateMarker(chunk[i].markerId, {
              status: "sent",
              resend_message_id: messageId,
            });
            sentCount++;
          } else {
            await updateMarker(chunk[i].markerId, {
              status: "failed",
              error: "no message id returned",
            });
            failedCount++;
          }
        }
      } catch (batchErr) {
        for (const p of chunk) {
          await updateMarker(p.markerId, {
            status: "failed",
            error: (batchErr as Error).message,
          });
          failedCount++;
        }
      }
    }

    // (j) the per-definition run row (aggregates only)
    const summary: RunSummary = {
      definitionKey: def.key,
      status: "completed",
      audienceSize,
      eligible: eligibleCount,
      sentCount,
      failedCount,
      skippedCount: sumSkipped(skipped),
      skipped,
      error: null,
    };
    await insertRunRow(summary);
    return summary;
  } catch (e) {
    // Infra failure mid-run: the run is failed; already-inserted 'pending' markers stay and
    // block their artists (at-most-once wins over completeness). Error messages here come
    // from Supabase/Resend infrastructure — never a recipient address.
    return failRun(def, (e as Error)?.message ?? "lifecycle run failed");
  }
}

/**
 * Run every ACTIVE lifecycle definition once. Draft definitions are skipped without a run
 * row (they are visible to Control Tower via /api/internal/lifecycle-runs). Definitions run
 * sequentially so their Resend pacing budgets never overlap.
 */
export async function runLifecycleEngine(): Promise<RunSummary[]> {
  // Defense in depth: the cron route already checks this flag before calling, but the
  // engine refuses on its own too, so no alternative caller can ever cause a send while
  // the kill switch is off. No DB access happens before this check.
  if (process.env.EMAIL_LIFECYCLE_ENABLED !== "true") {
    return [];
  }
  const summaries: RunSummary[] = [];
  for (const def of LIFECYCLE_DEFINITIONS) {
    if (def.status !== "active") continue;
    summaries.push(await runDefinition(def));
  }
  return summaries;
}
