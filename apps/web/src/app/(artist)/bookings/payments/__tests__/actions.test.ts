import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getUser,
  createCore,
  reviseCore,
  sendCore,
  cancelCore,
  refundCore,
  deliverLink,
  revalidatePath,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  createCore: vi.fn(),
  reviseCore: vi.fn(),
  sendCore: vi.fn(),
  cancelCore: vi.fn(),
  refundCore: vi.fn(),
  deliverLink: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/server/appointment-payments", () => ({
  createPaymentRequestCore: (...a: unknown[]) => createCore(...a),
  revisePaymentRequestCore: (...a: unknown[]) => reviseCore(...a),
  sendPaymentRequestCore: (...a: unknown[]) => sendCore(...a),
  cancelPaymentRequestCore: (...a: unknown[]) => cancelCore(...a),
}));
vi.mock("@/lib/server/appointment-payment-refund", () => ({
  refundPaymentRequestCore: (...a: unknown[]) => refundCore(...a),
}));
vi.mock("@/lib/server/appointment-payment-delivery", () => ({
  deliverPaymentRequestLink: (...a: unknown[]) => deliverLink(...a),
}));
// isArtistInitiatedFeeRefundCase is NOT mocked: the real allowlist is what the
// action relies on to reject a client-chosen fee-manipulating case.

import {
  createPaymentRequestAction,
  revisePaymentRequestAction,
  sendPaymentRequestAction,
  cancelPaymentRequestAction,
  refundPaymentRequestAction,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "artist1" } } });
  createCore.mockResolvedValue({ ok: true, id: "r1", status: "draft" });
  reviseCore.mockResolvedValue({ ok: true, id: "r2", status: "draft" });
  sendCore.mockResolvedValue({
    ok: true,
    id: "r1",
    status: "sent",
    customerToken: "tok1",
  });
  deliverLink.mockResolvedValue({
    payUrl: "https://inklee.app/pay/tok1",
    emailed: true,
  });
  cancelCore.mockResolvedValue({ ok: true, id: "r1", status: "cancelled" });
  refundCore.mockResolvedValue({
    status: "ok",
    refundId: "re1",
    refundedMinor: 5000,
  });
});

const CREATE_INPUT = {
  subject: { kind: "booking" as const, id: "b1" },
  collects: "deposit",
  currency: "eur",
  lines: [
    {
      name: "Deposit",
      unitAmountMinor: 5000,
      quantity: 1,
      classification: "tattoo_service",
    },
  ],
};

describe("createPaymentRequestAction", () => {
  it("creates a draft via the core and returns the id", async () => {
    const r = await createPaymentRequestAction(CREATE_INPUT);
    expect(r).toEqual({ ok: true, id: "r1" });
    expect(createCore).toHaveBeenCalledWith(
      expect.anything(),
      "artist1",
      expect.objectContaining({
        subject: { kind: "booking", id: "b1" },
        collects: "deposit",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/bookings/payments");
  });

  it("surfaces a not-entitled refusal without revalidating", async () => {
    createCore.mockResolvedValue({
      ok: false,
      code: "not_entitled",
      error: "Card deposits aren't included in your current plan.",
    });
    const r = await createPaymentRequestAction(CREATE_INPUT);
    expect(r).toEqual({
      ok: false,
      error: "Card deposits aren't included in your current plan.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses when not signed in, without calling the core", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await createPaymentRequestAction(CREATE_INPUT);
    expect(r).toEqual({ ok: false, error: "Not signed in." });
    expect(createCore).not.toHaveBeenCalled();
  });
});

const REVISE_INPUT = {
  id: "r1",
  collects: "deposit",
  lines: [
    {
      name: "Deposit",
      unitAmountMinor: 5000,
      quantity: 1,
      classification: "tattoo_service",
    },
  ],
};

describe("revisePaymentRequestAction", () => {
  it("revises via the core and returns the new revision's id", async () => {
    const r = await revisePaymentRequestAction(REVISE_INPUT);
    expect(r).toEqual({ ok: true, id: "r2" });
    expect(reviseCore).toHaveBeenCalledWith(
      expect.anything(),
      "artist1",
      "r1",
      {
        collects: "deposit",
        lines: REVISE_INPUT.lines,
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/bookings/payments");
    expect(revalidatePath).toHaveBeenCalledWith("/bookings/payments/r1");
  });

  it("surfaces the core's refusal without revalidating", async () => {
    reviseCore.mockResolvedValue({
      ok: false,
      code: "invalid",
      error: "Only a sent request can be revised.",
    });
    const r = await revisePaymentRequestAction(REVISE_INPUT);
    expect(r).toEqual({
      ok: false,
      error: "Only a sent request can be revised.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses when not signed in, without calling the core", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await revisePaymentRequestAction(REVISE_INPUT);
    expect(r).toEqual({ ok: false, error: "Not signed in." });
    expect(reviseCore).not.toHaveBeenCalled();
  });
});

describe("sendPaymentRequestAction", () => {
  it("sends via the core, delivers the link, and returns payUrl + emailed", async () => {
    const r = await sendPaymentRequestAction("r1");
    expect(r).toEqual({
      ok: true,
      payUrl: "https://inklee.app/pay/tok1",
      emailed: true,
    });
    expect(sendCore).toHaveBeenCalledWith(
      expect.anything(),
      "artist1",
      "r1",
      {},
    );
    // Delivery gets the token the core returned, not something re-derived.
    expect(deliverLink).toHaveBeenCalledWith(
      expect.anything(),
      "artist1",
      "r1",
      "tok1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/bookings/payments");
  });

  it("still succeeds (emailed:false, link intact) when delivery fails", async () => {
    deliverLink.mockResolvedValue({
      payUrl: "https://inklee.app/pay/tok1",
      emailed: false,
      reason: "send_failed",
    });
    const r = await sendPaymentRequestAction("r1");
    // The send is NOT rolled back by an email failure; the artist gets the
    // link to share manually.
    expect(r).toEqual({
      ok: true,
      payUrl: "https://inklee.app/pay/tok1",
      emailed: false,
    });
  });

  it("surfaces the core's error and does not deliver or revalidate", async () => {
    sendCore.mockResolvedValue({
      ok: false,
      code: "not_entitled",
      error: "Upgrade to send payment requests.",
    });
    const r = await sendPaymentRequestAction("r1");
    expect(r).toEqual({
      ok: false,
      error: "Upgrade to send payment requests.",
    });
    expect(deliverLink).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses when not signed in, without calling the core", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await sendPaymentRequestAction("r1");
    expect(r).toEqual({ ok: false, error: "Not signed in." });
    expect(sendCore).not.toHaveBeenCalled();
  });
});

describe("cancelPaymentRequestAction", () => {
  it("calls the core and revalidates on success", async () => {
    const r = await cancelPaymentRequestAction("r1");
    expect(r).toEqual({ ok: true });
    expect(cancelCore).toHaveBeenCalledWith(expect.anything(), "artist1", "r1");
    expect(revalidatePath).toHaveBeenCalledWith("/bookings/payments");
  });

  it("surfaces a settled-state refusal", async () => {
    cancelCore.mockResolvedValue({
      ok: false,
      code: "settled",
      error: "This request has already been paid.",
    });
    const r = await cancelPaymentRequestAction("r1");
    expect(r).toEqual({
      ok: false,
      error: "This request has already been paid.",
    });
  });

  it("refuses when not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await cancelPaymentRequestAction("r1");
    expect(r).toEqual({ ok: false, error: "Not signed in." });
    expect(cancelCore).not.toHaveBeenCalled();
  });
});

describe("refundPaymentRequestAction", () => {
  it("refunds via the core and revalidates on success", async () => {
    const r = await refundPaymentRequestAction({
      id: "r1",
      refundType: "full",
      case: "voluntary_full",
    });
    expect(r).toEqual({ ok: true });
    expect(refundCore).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: "artist1",
        requestId: "r1",
        refundType: "full",
        case: "voluntary_full",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/bookings/payments/r1");
  });

  it("rejects a fee-manipulating case WITHOUT calling the core (real allowlist)", async () => {
    const r = await refundPaymentRequestAction({
      id: "r1",
      refundType: "full",
      case: "inklee_error",
    });
    expect(r).toEqual({
      ok: false,
      error: "That refund reason isn't available.",
    });
    expect(refundCore).not.toHaveBeenCalled();
  });

  it("surfaces a core error (status: error)", async () => {
    refundCore.mockResolvedValue({
      status: "error",
      message: "Refund could not be processed.",
    });
    const r = await refundPaymentRequestAction({
      id: "r1",
      refundType: "full",
      case: "voluntary_full",
    });
    expect(r).toEqual({ ok: false, error: "Refund could not be processed." });
  });

  it("refuses when not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await refundPaymentRequestAction({
      id: "r1",
      refundType: "full",
      case: "voluntary_full",
    });
    expect(r).toEqual({ ok: false, error: "Not signed in." });
    expect(refundCore).not.toHaveBeenCalled();
  });
});
