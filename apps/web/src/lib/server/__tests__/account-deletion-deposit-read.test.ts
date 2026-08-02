import { describe, it, expect, vi, beforeEach } from "vitest";

// FEE-DSP-002 sweep finding: `deleteOwnAccountCore`'s booking_requests read
// (the query that widens in `platform_fee_collected_cents` for the retained
// financial snapshot) used to discard its error — `const { data } = await
// ...` with no `error` binding — while every LATER read in the same function
// (orders/payment_requests/lines/collections/allocations) already checks and
// throws. A silent failure here made `rows` (and so `liveUnpaid`/`paid`)
// empty, which would have let deletion proceed as if the artist had ZERO
// deposits: a live unpaid intent never gets cancelled (step 2) and a paid
// deposit's counsel-mandated record never gets retained (step 3). This is a
// pure control-flow defect (no schema mismatch — the column list is correct),
// so it is provable with a mocked serviceClient: force ONLY the
// booking_requests read to error and confirm the function now halts before
// ever reaching a destructive step, instead of silently treating the artist
// as depositless.

const h = vi.hoisted(() => ({
  fromImpl: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (...a: unknown[]) => h.fromImpl(...a),
    auth: { admin: { getUserById: (...a: unknown[]) => h.getUserById(...a) } },
  },
}));

function chain(reply: { data: unknown; error: unknown }) {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    not: () => self,
    in: () => self,
    order: () => self,
    limit: () => self,
    single: () => Promise.resolve(reply),
    maybeSingle: () => Promise.resolve(reply),
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(reply).then(resolve, reject),
  };
  return self;
}

import { deleteOwnAccountCore } from "@/lib/server/account-deletion";

beforeEach(() => {
  vi.clearAllMocks();
  h.getUserById.mockResolvedValue({
    data: { user: { email: "artist@example.com" } },
  });
});

describe("deleteOwnAccountCore: the booking_requests deposit read must not discard its error", () => {
  it("halts with a transient ERROR when the deposit read fails, instead of silently proceeding as if there were zero deposits", async () => {
    let profilesDeleteWasCalled = false;
    h.fromImpl.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () =>
            chain({ data: { stripe_account_id: null }, error: null }),
          delete: () => {
            profilesDeleteWasCalled = true;
            return chain({ data: null, error: null });
          },
        };
      }
      if (table === "booking_requests") {
        // The forced failure under test.
        return {
          select: () =>
            chain({ data: null, error: { message: "connection reset" } }),
        };
      }
      // Any table reached AFTER the fix's early return is a defect in the
      // fix itself (the function kept going past the failed read).
      throw new Error(
        `unexpected table reached after the deposit read should have halted: ${table}`,
      );
    });

    const result = await deleteOwnAccountCore(
      "11111111-1111-1111-1111-111111111111",
      {
        surface: "web",
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "ERROR",
      message:
        "Account deletion is temporarily unavailable. Please try again in a moment.",
    });
    // The whole point: nothing irreversible ran. profiles.delete() is step 4,
    // several steps after the deposit read.
    expect(profilesDeleteWasCalled).toBe(false);
  });

  it("proceeds past the deposit read when it succeeds (control case, proves the fix's early-return doesn't also block the happy path)", async () => {
    const tablesReached: string[] = [];
    h.fromImpl.mockImplementation((table: string) => {
      tablesReached.push(table);
      if (table === "profiles") {
        return {
          select: () =>
            chain({ data: { stripe_account_id: null }, error: null }),
        };
      }
      if (table === "booking_requests") {
        return { select: () => chain({ data: [], error: null }) };
      }
      if (table === "audit_log") {
        return { select: () => chain({ data: [], error: null }) };
      }
      if (table === "billing_subscriptions") {
        return { select: () => chain({ data: null, error: null }) };
      }
      // Everything past this point (orders/payment_requests/.../profiles
      // delete/etc.) is out of scope for this test's happy path — the step-3
      // try/catch (account-deletion.ts:261-368) converts a thrown error here
      // into the SAME {ok:false} shape as the fix under test, so throwing is
      // still a safe, fail-closed way to stand in for "not modeled further"
      // without silently mis-modeling a later step as succeeding.
      throw new Error(`unmocked table reached: ${table}`);
    });

    const result = await deleteOwnAccountCore(
      "22222222-2222-2222-2222-222222222222",
      { surface: "web" },
    );

    // The point of THIS test: unlike the erroring-deposit-read case above, the
    // orchestration got past booking_requests and reached orders (step 3) —
    // proving the fix only halts on an actual error, not unconditionally.
    expect(tablesReached).toContain("orders");
    expect(result).toEqual({
      ok: false,
      code: "ERROR",
      message:
        "Account deletion is temporarily unavailable. Please try again in a moment.",
    });
  });
});
