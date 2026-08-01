import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUser, createCore, sendCore, cancelCore, revalidatePath } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    createCore: vi.fn(),
    sendCore: vi.fn(),
    cancelCore: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/server/appointment-payments", () => ({
  createPaymentRequestCore: (...a: unknown[]) => createCore(...a),
  sendPaymentRequestCore: (...a: unknown[]) => sendCore(...a),
  cancelPaymentRequestCore: (...a: unknown[]) => cancelCore(...a),
}));

import {
  createPaymentRequestAction,
  sendPaymentRequestAction,
  cancelPaymentRequestAction,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "artist1" } } });
  createCore.mockResolvedValue({ ok: true, id: "r1", status: "draft" });
  sendCore.mockResolvedValue({ ok: true, id: "r1", status: "sent" });
  cancelCore.mockResolvedValue({ ok: true, id: "r1", status: "cancelled" });
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

describe("sendPaymentRequestAction", () => {
  it("calls the core with the artist id and revalidates on success", async () => {
    const r = await sendPaymentRequestAction("r1");
    expect(r).toEqual({ ok: true });
    expect(sendCore).toHaveBeenCalledWith(
      expect.anything(),
      "artist1",
      "r1",
      {},
    );
    expect(revalidatePath).toHaveBeenCalledWith("/bookings/payments");
  });

  it("surfaces the core's error and does not revalidate", async () => {
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
