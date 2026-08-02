import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmail, captureException } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliverPaymentRequestLink,
  sendPaymentReceiptEmail,
  sendRefundConfirmationEmail,
} from "@/lib/server/appointment-payment-delivery";

type Row = Record<string, unknown> | null;

// Per-table fake; every query in the module ends in maybeSingle().
function client(rows: Record<string, Row>): SupabaseClient {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve({ data: rows[table] ?? null, error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const REQUEST: Row = {
  id: "r1",
  booking_id: "b1",
  project_id: null,
  total_minor: 15000,
  currency: "eur",
};

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue(undefined);
});

describe("deliverPaymentRequestLink", () => {
  it("emails the booking's client the pay link and reports emailed", async () => {
    const c = client({
      payment_requests: REQUEST,
      booking_requests: { customer_email: "client@example.com" },
      profiles: { display_name: "Mika Ink" },
    });
    const r = await deliverPaymentRequestLink(c, "artist1", "r1", "tok123");
    expect(r.emailed).toBe(true);
    expect(r.payUrl).toMatch(/\/pay\/tok123$/);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        subject: "Payment request from Mika Ink",
      }),
    );
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    expect(html).toContain("/pay/tok123");
    expect(html).toContain("150.00 EUR");
  });

  it("resolves a PROJECT subject's client email", async () => {
    const c = client({
      payment_requests: { ...REQUEST, booking_id: null, project_id: "p1" },
      projects: { customer_email: "proj@example.com" },
      profiles: { display_name: "Mika Ink" },
    });
    const r = await deliverPaymentRequestLink(c, "artist1", "r1", "tok123");
    expect(r.emailed).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "proj@example.com" }),
    );
  });

  it("reports no_email (without sending) when the subject has no client email", async () => {
    const c = client({
      payment_requests: REQUEST,
      booking_requests: { customer_email: null },
      profiles: { display_name: "Mika Ink" },
    });
    const r = await deliverPaymentRequestLink(c, "artist1", "r1", "tok123");
    expect(r).toEqual({ payUrl: r.payUrl, emailed: false, reason: "no_email" });
    expect(sendEmail).not.toHaveBeenCalled();
    // The artist still gets the link to share manually.
    expect(r.payUrl).toMatch(/\/pay\/tok123$/);
  });

  it("reports send_failed (with the link intact) when the provider throws", async () => {
    sendEmail.mockRejectedValue(new Error("resend down"));
    const c = client({
      payment_requests: REQUEST,
      booking_requests: { customer_email: "client@example.com" },
      profiles: { display_name: "Mika Ink" },
    });
    const r = await deliverPaymentRequestLink(c, "artist1", "r1", "tok123");
    expect(r.emailed).toBe(false);
    expect(r.reason).toBe("send_failed");
    expect(r.payUrl).toMatch(/\/pay\/tok123$/);
    expect(captureException).toHaveBeenCalled();
  });

  it("reports send_failed when the request cannot be read (never throws)", async () => {
    const c = client({ payment_requests: null });
    const r = await deliverPaymentRequestLink(c, "artist1", "r1", "tok123");
    expect(r.emailed).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// The settlement receipt (Track A slice 4). Once-only comes from the caller
// (settlement's claim gate); this pins recipient resolution + fail-soft.
describe("sendPaymentReceiptEmail", () => {
  const ARGS = {
    artistId: "artist1",
    requestId: "r1",
    bookingId: "b1",
    projectId: null,
    amountMinor: 15000,
    currency: "eur",
    paidAt: "2026-08-01T10:00:00.000Z",
  };

  it("emails the booking's client a receipt with the amount and date", async () => {
    const c = client({
      booking_requests: { customer_email: "client@example.com" },
      profiles: { display_name: "Mika Ink" },
    });
    const ok = await sendPaymentReceiptEmail(c, ARGS);
    expect(ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        subject: "Your payment to Mika Ink",
      }),
    );
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    expect(html).toContain("150.00 EUR");
    expect(html).toContain("2026-08-01");
  });

  it("resolves a project subject's client", async () => {
    const c = client({
      projects: { customer_email: "proj@example.com" },
      profiles: { display_name: "Mika Ink" },
    });
    const ok = await sendPaymentReceiptEmail(c, {
      ...ARGS,
      bookingId: null,
      projectId: "p1",
    });
    expect(ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "proj@example.com" }),
    );
  });

  it("returns false without sending when the subject has no email", async () => {
    const c = client({ booking_requests: { customer_email: null } });
    expect(await sendPaymentReceiptEmail(c, ARGS)).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns false (never throws) when the provider fails, and captures", async () => {
    sendEmail.mockRejectedValue(new Error("resend down"));
    const c = client({
      booking_requests: { customer_email: "client@example.com" },
      profiles: { display_name: "Mika Ink" },
    });
    expect(await sendPaymentReceiptEmail(c, ARGS)).toBe(false);
    expect(captureException).toHaveBeenCalled();
  });
});

// C1.8 (docs/legal/counsel-accountant-handoff-2026-08.md Part 4): a refund
// that leaves a balance gets the verbatim partial-refund paragraph; one that
// doesn't keeps the plain full-refund wording. Named failure mode: swap the
// `isPartialRefundForBuyer` check for its negation and every assertion below
// that pins WHICH wording appeared flips.
describe("sendRefundConfirmationEmail", () => {
  const REFUND_ARGS = {
    artistId: "artist1",
    requestId: "r1",
    bookingId: "b1",
    projectId: null,
    refundedMinor: 5000,
    currency: "eur",
  };

  it("uses the plain full-refund wording when nothing remains (remainingRefundableMinor: 0)", async () => {
    const c = client({
      booking_requests: { customer_email: "client@example.com" },
      profiles: { display_name: "Mika Ink" },
    });
    const ok = await sendRefundConfirmationEmail(c, {
      ...REFUND_ARGS,
      remainingRefundableMinor: 0,
    });
    expect(ok).toBe(true);
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    expect(html).toContain(
      "has refunded 50.00 EUR to your original payment method",
    );
    expect(html).not.toContain("We have refunded");
    expect(html).not.toContain("right of return");
  });

  it("uses counsel's verbatim C1.8 wording, naming 'part of your order', when a bare partial refund leaves a balance", async () => {
    const c = client({
      booking_requests: { customer_email: "client@example.com" },
      profiles: { display_name: "Mika Ink" },
    });
    const ok = await sendRefundConfirmationEmail(c, {
      ...REFUND_ARGS,
      remainingRefundableMinor: 2500,
    });
    expect(ok).toBe(true);
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    expect(html).toContain(
      "We have refunded 50.00 EUR for part of your order.",
    );
    expect(html).toContain(
      "your right of return for the remaining items (where it applies) is unaffected.",
    );
  });

  it("names the specific lines instead of the generic fallback when lineNames is given", async () => {
    const c = client({
      booking_requests: { customer_email: "client@example.com" },
      profiles: { display_name: "Mika Ink" },
    });
    await sendRefundConfirmationEmail(c, {
      ...REFUND_ARGS,
      remainingRefundableMinor: 2500,
      lineNames: ["Print"],
    });
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    expect(html).toContain("We have refunded 50.00 EUR for Print.");
    expect(html).not.toContain("part of your order");
  });
});
