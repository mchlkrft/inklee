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
const PAGE = 1000; // PostgREST max_rows

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
      // Exact head counts per type — no rows fetched, so max_rows is irrelevant.
      const events: Record<string, number> = {};
      for (const t of [...EVENT_TYPES, "unsubscribed"]) {
        const { count, error } = await serviceClient
          .from("email_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", t);
        if (error) throw error;
        events[t] = count ?? 0;
      }
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

    // The job's delivered-to recipients: sent rows with a provider message id. Paged past
    // max_rows; bounded in practice by the dispatch endpoint's 5000 recipient cap.
    const messageIds: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await serviceClient
        .from("email_sends")
        .select("resend_message_id")
        .eq("job_id", jobId)
        .eq("status", "sent")
        .not("resend_message_id", "is", null)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as { resend_message_id: string }[];
      for (const r of rows) messageIds.push(r.resend_message_id);
      if (rows.length < PAGE) break;
    }

    // Tally events for those messages: total per type + distinct messages per type.
    const totals = zeroCounts();
    const uniqueSets: Record<EventType, Set<string>> = Object.fromEntries(
      EVENT_TYPES.map((t) => [t, new Set<string>()]),
    ) as Record<EventType, Set<string>>;
    for (let i = 0; i < messageIds.length; i += ID_CHUNK) {
      const chunk = messageIds.slice(i, i + ID_CHUNK);
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await serviceClient
          .from("email_events")
          .select("event_type, resend_message_id")
          .in("resend_message_id", chunk)
          .order("created_at", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as {
          event_type: EventType;
          resend_message_id: string | null;
        }[];
        for (const r of rows) {
          if (!(r.event_type in totals)) continue;
          totals[r.event_type]++;
          if (r.resend_message_id)
            uniqueSets[r.event_type].add(r.resend_message_id);
        }
        if (rows.length < PAGE) break;
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
