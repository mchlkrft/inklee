// HMAC-verified campaign dispatch endpoint. Control Tower schedules + reviews a marketing or
// lifecycle campaign, then POSTs a Standard-Webhooks-signed job here. The ENTIRE send runs
// inside Inklee — segment resolution, per-recipient filtering (suppression / opt-out / dedup /
// no-email), and the Resend batch send — so no recipient PII ever crosses back to CT. The
// response carries ONLY aggregates + masked handle samples.
//
// SAFETY (belt and braces): a real send is impossible unless BOTH the payload has dryRun===false
// AND process.env.EMAIL_CAMPAIGNS_ENABLED === 'true'. The default (flag unset) never sends. A dry
// run never calls Resend. HMAC fails closed (missing secret -> 500, bad signature -> 401). A
// replayed idempotency_key returns the existing job and never re-runs. A per-job recipient cap is
// a circuit breaker. is_tester artists are excluded upstream by the segment resolver.
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { serviceClient } from "@/lib/supabase/service";
import { verifyDispatchSignature } from "@/lib/email-campaigns/webhook-signature";
import {
  resolveSegmentArtists,
  KNOWN,
  type SegmentArtist,
} from "@/lib/email-campaigns/resolve-segment";
import { isOptedOut } from "@/lib/email-campaigns/preferences";
import { resolveRecipientMeta } from "@/lib/email-campaigns/recipients";
import { aggregateJobResponse } from "@/lib/email-campaigns/job-response";
import {
  buildRecipientMessage,
  type ResendMessage,
} from "@/lib/email-campaigns/messaging";
import { escapeHtml } from "@/lib/email/layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Circuit breaker: refuse an oversized audience rather than fan out a huge send by accident.
const MAX_CAMPAIGN_RECIPIENTS = 5000;
const BATCH_SIZE = 100; // Resend batch API cap
const BATCH_PACING_MS = 500; // stay under Resend's ~2 req/s default
const SEND_INSERT_CHUNK = 200; // bulk email_sends insert size

type DispatchBody = {
  executionKey?: unknown;
  category?: unknown;
  idempotencyKey?: unknown;
  dryRun?: unknown;
  campaignId?: unknown;
  segmentName?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
  bodyMd?: unknown;
  fromIdentity?: unknown;
};

function maskHandle(raw: string | null | undefined): string {
  if (!raw || raw.length < 4) return "***";
  return `${raw[0]}***`;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// A permitted sender identity: a bare address or "Display Name <address>" on inklee.app (the
// Resend-verified domain). CT's campaign review displays the sender it attests, so this route
// must either honor it or refuse; silently substituting a different sender would falsify the
// review, and a foreign domain would fail DMARC.
const FROM_ADDR = /^[a-z0-9._%+-]+@inklee\.app$/i;
function isPermittedFrom(v: string): boolean {
  // The display-name group also forbids '@' and ',' so a mailbox list or a foreign address
  // cannot be smuggled into the visible name ("evil@x.com, Inklee <a@inklee.app>").
  const m = v.trim().match(/^([^<>\r\n@,]+)<([^<>\r\n]+)>$/);
  const addr = (m ? m[2] : v).trim();
  return FROM_ADDR.test(addr);
}

export async function POST(request: Request) {
  let jobId: string | null = null;
  let dropJobRowOnFailure = false;
  try {
    // (a) raw body once (needed for the signature)
    const rawBody = await request.text();

    // (b) fail-closed HMAC
    const secret = process.env.CT_DISPATCH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "not configured" }, { status: 500 });
    }
    if (!verifyDispatchSignature(rawBody, request.headers, secret)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // (c) parse
    let body: DispatchBody;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    // (d) validate execution key + category (transactional campaigns are not dispatched)
    const executionKey = str(body.executionKey) ?? "";
    if (!KNOWN.has(executionKey)) {
      return NextResponse.json({ error: "unknown segment" }, { status: 400 });
    }
    const category = str(body.category);
    if (category !== "marketing" && category !== "lifecycle") {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    // The sender CT's review attested. Absent means the EMAIL_FROM default; present but not
    // a plausible inklee.app identity is refused outright (nothing persisted), because the
    // review showed a sender this route could not honor.
    const fromIdentity = str(body.fromIdentity);
    if (fromIdentity && !isPermittedFrom(fromIdentity)) {
      return NextResponse.json(
        { error: "invalid sender identity: must be an inklee.app address" },
        { status: 400 },
      );
    }
    const idempotencyKey = str(body.idempotencyKey);
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: "missing idempotency key" },
        { status: 400 },
      );
    }
    // dryRun defaults to true — only an explicit false is treated as a real send.
    const dryRun = body.dryRun !== false;

    // (e) idempotency — a replayed key returns the existing job unchanged, never re-runs
    const { data: existing } = await serviceClient
      .from("email_jobs")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(aggregateJobResponse(existing));
    }

    const sendingEnabled = process.env.EMAIL_CAMPAIGNS_ENABLED === "true";

    const jobBase = {
      idempotency_key: idempotencyKey,
      campaign_id: str(body.campaignId),
      execution_key: executionKey,
      segment_name: str(body.segmentName),
      category,
      subject: str(body.subject),
    };

    // (f) real-send gates: a non-dry job never sends while the campaign flag is off, and
    // never sends without the physical postal address CAN-SPAM requires in the footer (fail
    // closed; the placeholder that used to ship instead was a compliance hole). Defense in
    // depth on top of Control Tower's own gate. IMPORTANT: do NOT persist a row here. CT
    // reuses a STABLE idempotency_key for a review stamp, so a row keyed by it with
    // status='failed' would poison block (e): every later retry (even after the config is
    // fixed) would short-circuit to the cached failure and the campaign could never send.
    // Return the failure aggregate directly.
    const realSendBlocker = !sendingEnabled
      ? "campaign sending is not enabled"
      : !process.env.EMAIL_POSTAL_ADDRESS
        ? "EMAIL_POSTAL_ADDRESS is not set"
        : !process.env.RESEND_API_KEY
          ? "RESEND_API_KEY is not set"
          : null;
    if (!dryRun && realSendBlocker) {
      return NextResponse.json({
        jobId: null,
        status: "failed",
        audienceSize: 0,
        wouldSend: 0,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        skipped: {
          opted_out: 0,
          suppressed: 0,
          tester: 0,
          dedup: 0,
          no_email: 0,
        },
        sample: [],
        error: realSendBlocker,
      });
    }

    // (g) create the running job row
    const { data: job, error: jobErr } = await serviceClient
      .from("email_jobs")
      .insert({
        ...jobBase,
        dry_run: dryRun,
        status: "running",
        sending_enabled: sendingEnabled,
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (jobErr || !job) {
      throw jobErr ?? new Error("job insert failed");
    }
    jobId = job.id as string;
    // From here until the first provider call, a REAL run's failure must DROP this row rather
    // than persist it as failed: block (e) caches whatever lands under the stable idempotency
    // key, and a cached pre-send failure would poison every retry. Once sending may have
    // started, at-most-once wins and failures persist. Dry runs always persist (fresh keys).
    dropJobRowOnFailure = !dryRun;

    // (h) resolve segment -> non-tester artist rows
    const artists: SegmentArtist[] = await resolveSegmentArtists(executionKey);
    const audienceSize = artists.length;
    const sample = artists
      .slice(0, 8)
      .map((a) => maskHandle(a.instagram_handle ?? a.slug));

    // circuit breaker
    if (audienceSize > MAX_CAMPAIGN_RECIPIENTS) {
      const capError = `audience ${audienceSize} exceeds cap ${MAX_CAMPAIGN_RECIPIENTS}`;
      if (!dryRun) {
        // pre-send failure on a REAL run: drop the row so the stable key is not poisoned
        // (see the note at the insert). If the delete fails, fall through and persist;
        // a poisoned key beats a row wedged at 'running'.
        const { error: delErr } = await serviceClient
          .from("email_jobs")
          .delete()
          .eq("id", job.id);
        if (!delErr) {
          return NextResponse.json({
            jobId: null,
            status: "failed",
            audienceSize,
            wouldSend: 0,
            sentCount: 0,
            failedCount: 0,
            skippedCount: 0,
            skipped: {
              opted_out: 0,
              suppressed: 0,
              tester: 0,
              dedup: 0,
              no_email: 0,
            },
            sample,
            error: capError,
          });
        }
      }
      const { data: capped } = await serviceClient
        .from("email_jobs")
        .update({
          status: "failed",
          audience_size: audienceSize,
          would_send: 0,
          sample,
          error: capError,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .select("*")
        .single();
      return NextResponse.json(aggregateJobResponse(capped ?? job));
    }

    // (i) profile meta + emails + suppression set via the shared resolver
    // (lib/email-campaigns/recipients), the single implementation this route and the
    // lifecycle engine both use: chunked profile fetch, bounded-concurrency admin email
    // lookup, chunked suppression query. A query failure throws into the outer catch
    // (job failed) — an incomplete suppression set must never let a send proceed.
    const { profileMeta, artistEmail, suppressed } =
      await resolveRecipientMeta(artists);

    // (j) filter each artist IN MEMORY (skip reason + status), then BULK-insert the email_sends
    // rows in ~200-row chunks (not one insert per artist — that was a second O(N) round-trip that
    // contributed to the timeout). Client-generated ids let us update survivors after the send
    // without a positional read-back. Dedup: the resolver returns distinct artists and idempotency
    // prevents a job re-running, so UNIQUE(job_id, artist_id) cannot fire on a fresh job; a
    // defensive in-memory seen-set still collapses any hypothetical duplicate into skipped_dedup.
    let optedOutCount = 0;
    let suppressedCount = 0;
    let dedupCount = 0;
    let noEmailCount = 0;
    const survivors: {
      artistId: string;
      email: string;
      slug: string | null;
      sendRowId: string;
      displayName: string;
    }[] = [];
    const sendRows: {
      id: string;
      job_id: string;
      artist_id: string;
      recipient_email: string | null;
      status: string | null;
      skip_reason: string | null;
    }[] = [];
    const seen = new Set<string>();

    for (const a of artists) {
      if (seen.has(a.id)) {
        dedupCount++;
        continue;
      }
      seen.add(a.id);

      const email = artistEmail.get(a.id) ?? null;
      const meta = profileMeta.get(a.id);
      const settings = meta?.settings ?? {};

      let status: string | null;
      let skipReason: string | null;
      if (!email) {
        status = "skipped_no_email";
        skipReason = "no_email";
        noEmailCount++;
      } else if (suppressed.has(email)) {
        // suppression overrides everything, including opt-in
        status = "skipped_suppressed";
        skipReason = "suppressed";
        suppressedCount++;
      } else if (isOptedOut(settings, category)) {
        status = "skipped_opted_out";
        skipReason = "opted_out";
        optedOutCount++;
      } else {
        status = null; // survivor (pending); NULL passes the status CHECK
        skipReason = null;
      }

      const rowId = randomUUID();
      sendRows.push({
        id: rowId,
        job_id: job.id,
        artist_id: a.id,
        recipient_email: email,
        status,
        skip_reason: skipReason,
      });
      if (status === null) {
        survivors.push({
          artistId: a.id,
          email: email as string,
          slug: a.slug,
          sendRowId: rowId,
          displayName: meta?.displayName ?? "there",
        });
      }
    }

    for (let i = 0; i < sendRows.length; i += SEND_INSERT_CHUNK) {
      const { error: insErr } = await serviceClient
        .from("email_sends")
        .insert(sendRows.slice(i, i + SEND_INSERT_CHUNK));
      if (insErr) throw insErr; // real infra failure -> job failed (outer catch)
    }

    const skippedCount =
      optedOutCount + suppressedCount + dedupCount + noEmailCount;
    const skippedDetail = {
      opted_out: optedOutCount,
      suppressed: suppressedCount,
      tester: 0, // testers excluded by the resolver, never reach here
      dedup: dedupCount,
      no_email: noEmailCount,
    };

    // (k) DRY RUN: everything except the actual send. Resend is never called. A completed
    // dry run still carries a warning note when the postal address is missing, so the
    // operator learns before a real dispatch is refused for it (gate f).
    if (dryRun) {
      const { data: done } = await serviceClient
        .from("email_jobs")
        .update({
          status: "completed",
          audience_size: audienceSize,
          would_send: survivors.length,
          sent_count: 0,
          failed_count: 0,
          skipped_count: skippedCount,
          skipped_detail: skippedDetail,
          sample,
          error: process.env.EMAIL_POSTAL_ADDRESS
            ? null
            : "note: EMAIL_POSTAL_ADDRESS is not set; a real dispatch will be refused until it is configured",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .select("*")
        .single();
      return NextResponse.json(aggregateJobResponse(done ?? job));
    }

    // (l) REAL SEND: only reachable when dryRun===false AND gate (f) passed (flag on,
    // postal address and provider key present).
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Unreachable after gate (f)'s pre-insert check; kept as a loud backstop so a future
      // refactor can never silently "succeed" a real send with no provider.
      const { data: done } = await serviceClient
        .from("email_jobs")
        .update({
          status: "failed",
          audience_size: audienceSize,
          would_send: survivors.length,
          skipped_count: skippedCount,
          skipped_detail: skippedDetail,
          sample,
          error: "RESEND_API_KEY is not set",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .select("*")
        .single();
      return NextResponse.json(aggregateJobResponse(done ?? job));
    }
    const resend = new Resend(apiKey);
    // The reviewed sender, when CT supplied one (validated above); the EMAIL_FROM default
    // otherwise. What the review displayed is what actually goes out.
    const from =
      fromIdentity ?? process.env.EMAIL_FROM ?? "inklee <noreply@inklee.app>";

    // html/text are INNER CONTENT (markdown body + CTA), not a full HTML document —
    // buildRecipientMessage appends the compliance footer (unsubscribe + preferences +
    // EMAIL_POSTAL_ADDRESS) as inner content and renderEmailShell wraps the result exactly
    // ONCE (one DOCTYPE / logo / tagline). The bodyMd fallback is likewise inner content.
    const subjectTpl = str(body.subject) ?? "";
    const htmlTpl =
      str(body.html) ??
      (str(body.bodyMd)
        ? `<p>${escapeHtml(str(body.bodyMd) as string)}</p>`
        : "");
    const textTpl = str(body.text) ?? str(body.bodyMd) ?? "";

    let sentCount = 0;
    let failedCount = 0;

    for (let c = 0; c * BATCH_SIZE < survivors.length; c++) {
      if (c > 0) {
        await new Promise((r) => setTimeout(r, BATCH_PACING_MS));
      }
      const chunk = survivors.slice(c * BATCH_SIZE, (c + 1) * BATCH_SIZE);

      // Build one personalized message per recipient (their own token URL + headers) via the
      // shared compliance-critical constructor (lib/email-campaigns/messaging), the single
      // implementation this route and the lifecycle engine both use. Message building hits
      // the DB (unsubscribe tokens) and can throw; that is still PRE-send for chunk 0, so the
      // drop flag stays set until the first provider call below.
      const messages: ResendMessage[] = [];
      for (const s of chunk) {
        messages.push(
          await buildRecipientMessage({
            from,
            email: s.email,
            displayName: s.displayName,
            slug: s.slug,
            artistId: s.artistId,
            subjectTpl,
            htmlTpl,
            textTpl,
          }),
        );
      }

      // The first provider call is imminent: from here a failure persists as 'failed'
      // (at-most-once wins over a retriable key). Later chunks re-assign harmlessly.
      dropJobRowOnFailure = false;

      try {
        const { data, error } = await resend.batch.send(messages, {
          idempotencyKey: `${job.id}:${c}`,
        });
        if (error || !data) {
          // whole-batch failure is best-effort per-recipient: record + continue
          for (const s of chunk) {
            await serviceClient
              .from("email_sends")
              .update({
                status: "failed",
                error: error?.message ?? "batch send failed",
              })
              .eq("id", s.sendRowId);
            failedCount++;
          }
          continue;
        }
        const results = data.data ?? [];
        for (let i = 0; i < chunk.length; i++) {
          const s = chunk[i];
          const messageId = results[i]?.id ?? null;
          if (messageId) {
            await serviceClient
              .from("email_sends")
              .update({ status: "sent", resend_message_id: messageId })
              .eq("id", s.sendRowId);
            sentCount++;
          } else {
            await serviceClient
              .from("email_sends")
              .update({ status: "failed", error: "no message id returned" })
              .eq("id", s.sendRowId);
            failedCount++;
          }
        }
      } catch (batchErr) {
        for (const s of chunk) {
          await serviceClient
            .from("email_sends")
            .update({
              status: "failed",
              error: (batchErr as Error).message,
            })
            .eq("id", s.sendRowId);
          failedCount++;
        }
      }
    }

    // (m) complete
    const { data: done } = await serviceClient
      .from("email_jobs")
      .update({
        status: "completed",
        audience_size: audienceSize,
        would_send: survivors.length,
        sent_count: sentCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        skipped_detail: skippedDetail,
        sample,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .single();

    // (n) aggregates + masked sample only — never emails or raw handles
    return NextResponse.json(aggregateJobResponse(done ?? job));
  } catch (e) {
    // Best-effort bookkeeping. A REAL run that failed BEFORE any provider call DROPS its row:
    // block (e) caches whatever lands under the stable idempotency key, so a persisted
    // pre-send failure would replay on every retry. Anything at or after the first provider
    // call persists as failed (at-most-once wins mid-send), as do dry runs.
    if (jobId) {
      let dropped = false;
      if (dropJobRowOnFailure) {
        try {
          const { error: delErr } = await serviceClient
            .from("email_jobs")
            .delete()
            .eq("id", jobId);
          dropped = !delErr;
        } catch {
          // fall through to persisting the failure
        }
      }
      if (!dropped) {
        try {
          await serviceClient
            .from("email_jobs")
            .update({
              status: "failed",
              error: "dispatch failed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        } catch {
          // swallow; never mask the original failure
        }
      }
    }
    console.error("[email-jobs] dispatch failed", (e as Error)?.message);
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 });
  }
}
