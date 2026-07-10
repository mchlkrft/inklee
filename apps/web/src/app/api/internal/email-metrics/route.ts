// Read-only metrics rollup for the Control Tower Email hub (slice 10). Two scopes:
//
//   { jobId }            -> per-campaign: event counts joined to the job's recipients via
//                           resend_message_id, plus unique opened/clicked (distinct messages).
//   { scope: "overall" } -> global totals per event type (head counts, exact at any volume),
//                           including 'unsubscribed', which has no message id and therefore
//                           only exists at this scope.
//
// Returns AGGREGATES ONLY — counts, never an event row, address or message id. Like the job
// status endpoint this is a read path, so a plain Bearer (CT_DISPATCH_SECRET) is sufficient.
// Fail-closed: missing secret -> 500, mismatch -> 401.
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { fetchAllRows } from "@/lib/email-campaigns/resolve-segment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT_TYPES = [
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "opened",
  "clicked",
] as const;
type EventType = (typeof EVENT_TYPES)[number];

const ID_CHUNK = 200; // .in() URL safety
// Generous paging caps for fetchAllRows: recipients are bounded by the dispatch endpoint's
// 5000 cap; events are a small multiple of that (repeated opens/clicks included).
const SENDS_CAP = 10_000;
const EVENTS_CAP = 100_000;

type Counts = Record<EventType, number>;
const zeroCounts = (): Counts =>
  Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as Counts;

export async function POST(request: Request) {
  const secret = process.env.CT_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { jobId?: unknown; scope?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    if (body.scope === "overall") {
      // Exact head counts per type — no rows fetched, so max_rows is irrelevant. The counts
      // are independent, so they run in parallel (one round trip of wall clock, not eight).
      const types = [...EVENT_TYPES, "unsubscribed"];
      const counts = await Promise.all(
        types.map(async (t) => {
          const { count, error } = await serviceClient
            .from("email_events")
            .select("id", { count: "exact", head: true })
            .eq("event_type", t);
          if (error) throw error;
          return count ?? 0;
        }),
      );
      const events: Record<string, number> = Object.fromEntries(
        types.map((t, i) => [t, counts[i]]),
      );
      return NextResponse.json({
        scope: "overall",
        jobId: null,
        recipients: null,
        events,
        unique: null,
      });
    }

    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { data: job } = await serviceClient
      .from("email_jobs")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // The job's delivered-to recipients: sent rows with a provider message id. fetchAllRows
    // pages past max_rows with a stable id order; bounded in practice by the dispatch
    // endpoint's 5000 recipient cap.
    const sendRows = (await fetchAllRows(
      () =>
        serviceClient
          .from("email_sends")
          .select("resend_message_id")
          .eq("job_id", jobId)
          .eq("status", "sent")
          .not("resend_message_id", "is", null),
      SENDS_CAP,
    )) as { resend_message_id: string }[];
    const messageIds = sendRows.map((r) => r.resend_message_id);

    // Tally events for those messages: total per type + distinct messages per type. The
    // id-chunks are independent, so they are fetched in parallel; paging within a chunk
    // stays sequential inside fetchAllRows.
    const totals = zeroCounts();
    const uniqueSets: Record<EventType, Set<string>> = Object.fromEntries(
      EVENT_TYPES.map((t) => [t, new Set<string>()]),
    ) as Record<EventType, Set<string>>;
    const chunks: string[][] = [];
    for (let i = 0; i < messageIds.length; i += ID_CHUNK) {
      chunks.push(messageIds.slice(i, i + ID_CHUNK));
    }
    const chunkRows = await Promise.all(
      chunks.map(
        (chunk) =>
          fetchAllRows(
            () =>
              serviceClient
                .from("email_events")
                .select("event_type, resend_message_id")
                .in("resend_message_id", chunk),
            EVENTS_CAP,
          ) as Promise<
            { event_type: EventType; resend_message_id: string | null }[]
          >,
      ),
    );
    for (const rows of chunkRows) {
      for (const r of rows) {
        if (!(r.event_type in totals)) continue;
        totals[r.event_type]++;
        if (r.resend_message_id)
          uniqueSets[r.event_type].add(r.resend_message_id);
      }
    }

    return NextResponse.json({
      scope: "job",
      jobId,
      recipients: messageIds.length,
      events: { ...totals, unsubscribed: null }, // no per-campaign attribution (no message id)
      unique: {
        opened: uniqueSets.opened.size,
        clicked: uniqueSets.clicked.size,
        delivered: uniqueSets.delivered.size,
        bounced: uniqueSets.bounced.size,
        complained: uniqueSets.complained.size,
      },
    });
  } catch {
    // never leak query internals
    return NextResponse.json({ error: "metrics failed" }, { status: 500 });
  }
}
