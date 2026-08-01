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
import { deliverPaymentRequestLink } from "@/lib/server/appointment-payment-delivery";

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
