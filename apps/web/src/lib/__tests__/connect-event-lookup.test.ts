import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `persistConnectAccountFromEvent`'s profile lookup (PAT-004).
 *
 * WHY THIS FILE EXISTS, and it is a live-incident guard rather than a tidy-up.
 * The lookup used to be `const { data: artist }` with the error dropped, so a
 * FAILED read and a GENUINELY UNRECOGNISED account both produced
 * `{ userId: null }`. The webhook route turns that into HTTP 200
 * `{received:true}`, Stripe records the event as delivered and never retries,
 * and the cached Connect state stays stale with nothing recorded anywhere.
 *
 * Cached Connect state going stale is not hypothetical here: it is the
 * documented cause of the 2026-07-21 incident where a booking was written as a
 * manual deposit while the artist had just been told the client pays by card.
 *
 * The two outcomes need DIFFERENT handling, which is why the fix also moved
 * `single()` to `maybeSingle()`. `single()` reports "no rows" as an error, so
 * the moment the error is checked at all, the benign unrecognised-account case
 * would start failing loudly and every foreign Connect event would retry
 * forever. Both branches are pinned below; neither is safe without the other.
 */

// vi.hoisted, because vi.mock factories are lifted above every const in the
// file. Declaring these normally fails with "Cannot access before
// initialization" the moment a factory closes over one.
const h = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const updateEq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const captureException = vi.fn();
  return { maybeSingle, update, captureException };
});

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }),
      // `persistConnectAccount` (the success path) issues an UPDATE on the
      // same table. Exposing it keeps the happy path reachable, so the
      // positive control below is a real control and not another refusal.
      update: h.update,
    }),
  },
}));
vi.mock("@/lib/stripe", () => ({ stripe: null }));
vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));

const { maybeSingle, update, captureException } = h;

import { persistConnectAccountFromEvent } from "@/lib/stripe-connect";

/** Minimal Stripe.Account shape the function touches. */
const ACCOUNT = {
  id: "acct_TEST123",
  charges_enabled: true,
  payouts_enabled: true,
  details_submitted: true,
  country: "EE",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

beforeEach(() => {
  maybeSingle.mockReset();
  captureException.mockReset();
  update.mockClear();
});

describe("persistConnectAccountFromEvent: the profile lookup", () => {
  // FAILS IF the error binding is removed. Before the fix this returned
  // { userId: null } and the route answered 200, so Stripe never retried.
  it("returns an ERROR when the lookup fails, so the route can answer non-2xx and Stripe retries", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });

    const result = await persistConnectAccountFromEvent(ACCOUNT);

    expect(result).toHaveProperty("error");
    expect("error" in result && result.error).toContain("connection reset");
    // Never silently: a dropped Connect state change has to leave a trace.
    expect(captureException).toHaveBeenCalledTimes(1);
    // And it must NOT have tried to write against a row it never resolved.
    expect(update).not.toHaveBeenCalled();
  });

  // DISTINCTION CONTROL, and the fix is wrong without it. A version that
  // treated every empty lookup as a fault would pass the test above and then
  // retry forever on Connect events belonging to other apps that share the
  // same platform.
  it("DISTINCTION: an unrecognised account is still a benign no-op, not an error", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await persistConnectAccountFromEvent(ACCOUNT);

    expect(result).toEqual({ userId: null });
    expect(captureException).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  // POSITIVE CONTROL. Without this, a function that refused everything would
  // pass both tests above. Proves a recognised account still reaches the write.
  it("POSITIVE CONTROL: a recognised account is resolved and persisted", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    });

    const result = await persistConnectAccountFromEvent(ACCOUNT);

    expect(result).toEqual({ userId: "user-1" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  // The two failure modes must stay TELLABLE APART at the call site, which is
  // the entire point of the change. Asserted directly rather than inferred
  // from the three tests above, because "both return falsy userId" is exactly
  // the confusion that shipped.
  it("a failed read and an unknown account do not produce the same value", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const failed = await persistConnectAccountFromEvent(ACCOUNT);
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const unknown = await persistConnectAccountFromEvent(ACCOUNT);

    expect(failed).not.toEqual(unknown);
    expect("error" in failed).toBe(true);
    expect("error" in unknown).toBe(false);
  });
});
