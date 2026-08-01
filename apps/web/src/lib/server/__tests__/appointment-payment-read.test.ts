import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listPaymentRequestsForArtist,
  getPaymentRequestForArtist,
} from "@/lib/server/appointment-payment-read";

type Resp = { data?: unknown; error?: unknown };

// The read module takes the (RLS-scoped) client as a parameter, so a fake that
// answers per table is enough. `order` and `maybeSingle` are the terminals.
function client(resp: { requests?: Resp; lines?: Resp }): SupabaseClient {
  return {
    from(table: string) {
      const r =
        table === "payment_requests"
          ? (resp.requests ?? { data: [], error: null })
          : (resp.lines ?? { data: [], error: null });
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => Promise.resolve(r),
        maybeSingle: () => Promise.resolve(r),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("listPaymentRequestsForArtist", () => {
  it("maps rows to summaries, deriving subject + linkSent", async () => {
    const c = client({
      requests: {
        data: [
          {
            id: "r1",
            status: "sent",
            booking_id: "b1",
            project_id: null,
            currency: "eur",
            total_minor: 15000,
            revision: 2,
            sent_at: "2026-07-31T10:00:00Z",
            created_at: "2026-07-31T09:00:00Z",
            collects: "balance",
          },
          {
            id: "r2",
            status: "draft",
            booking_id: null,
            project_id: "p1",
            currency: "eur",
            total_minor: 0,
            revision: 1,
            sent_at: null,
            created_at: "2026-07-30T09:00:00Z",
            collects: null,
          },
        ],
        error: null,
      },
    });
    const out = await listPaymentRequestsForArtist(c, "artist1");
    expect(out).toEqual([
      {
        id: "r1",
        status: "sent",
        subject: "appointment",
        bookingId: "b1",
        projectId: null,
        currency: "eur",
        totalMinor: 15000,
        revision: 2,
        linkSent: true,
        createdAt: "2026-07-31T09:00:00Z",
        sentAt: "2026-07-31T10:00:00Z",
        collects: "balance",
      },
      {
        id: "r2",
        status: "draft",
        subject: "project",
        bookingId: null,
        projectId: "p1",
        currency: "eur",
        totalMinor: 0,
        revision: 1,
        linkSent: false,
        createdAt: "2026-07-30T09:00:00Z",
        sentAt: null,
        // No stamp on an unsent draft (0125's freeze latch); the read layer
        // falls back to the same "deposit" default the create form's own
        // COLLECTS list starts on, so a caller with no OTHER source (the
        // native revise screen) prefills something valid rather than "null".
        collects: "deposit",
      },
    ]);
  });

  it("throws on a read error rather than reporting an empty list", async () => {
    const c = client({ requests: { data: null, error: { message: "boom" } } });
    await expect(listPaymentRequestsForArtist(c, "a")).rejects.toThrow(/boom/);
  });

  it("returns an empty array when the artist has none", async () => {
    const c = client({ requests: { data: [], error: null } });
    expect(await listPaymentRequestsForArtist(c, "a")).toEqual([]);
  });
});

describe("getPaymentRequestForArtist", () => {
  it("returns the request with its lines", async () => {
    const c = client({
      requests: {
        data: {
          id: "r1",
          status: "sent",
          booking_id: "b1",
          project_id: null,
          currency: "eur",
          total_minor: 15000,
          revision: 1,
          sent_at: "2026-07-31T10:00:00Z",
          created_at: "2026-07-31T09:00:00Z",
        },
        error: null,
      },
      lines: {
        data: [
          {
            id: "l1",
            name: "Tattoo",
            description: null,
            quantity: 1,
            unit_amount_minor: 15000,
            line_total_minor: 15000,
            classification: "tattoo_service",
            refund_status: "none",
            position: 0,
          },
        ],
        error: null,
      },
    });
    const out = await getPaymentRequestForArtist(c, "a", "r1");
    expect(out?.id).toBe("r1");
    expect(out?.subject).toBe("appointment");
    expect(out?.lines).toEqual([
      {
        id: "l1",
        name: "Tattoo",
        description: null,
        quantity: 1,
        unitAmountMinor: 15000,
        lineTotalMinor: 15000,
        classification: "tattoo_service",
        refundStatus: "none",
        position: 0,
      },
    ]);
  });

  it("returns null when the request is not found or not the artist's", async () => {
    const c = client({ requests: { data: null, error: null } });
    expect(await getPaymentRequestForArtist(c, "a", "missing")).toBeNull();
  });

  it("throws on a request read error", async () => {
    const c = client({
      requests: { data: null, error: { message: "db down" } },
    });
    await expect(getPaymentRequestForArtist(c, "a", "r1")).rejects.toThrow(
      /db down/,
    );
  });
});
