import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Counsel Q13 clause 2 (docs/legal/counsel-handoff-2026-08-02.md §5.3): at
 * window-end Inklee must request deletion of the artist's Connected Account,
 * and the ratified decision requires a ZERO BALANCE first. Before this,
 * account deletion "performs no balance check of any kind", so the
 * precondition was unenforced because the action it gated did not exist.
 *
 * The balance check is the part with a real failure mode: reading only
 * `available` would delete an account with money still in flight, and reading
 * the PLATFORM balance instead of the connected one would never be zero and
 * would block every teardown forever. Both are pinned below, each against a
 * positive control that shows the teardown genuinely completing.
 */

const h = vi.hoisted(() => ({
  balanceRetrieve: vi.fn(),
  accountsDel: vi.fn(),
  rows: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[],
  escalationRows: [] as Record<string, unknown>[],
  escalationExists: false,
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    balance: { retrieve: h.balanceRetrieve },
    accounts: { del: h.accountsDel },
  },
}));

vi.mock("@/lib/supabase/service", () => {
  // `rows` answers the teardown-due query; `escalationRows` answers the
  // review-due query, which is a different table and must be able to be empty
  // while the first is not.
  const builder = (payload: () => unknown) => {
    const self: Record<string, unknown> = {
      select: () => self,
      not: () => self,
      in: () => self,
      lt: () => self,
      lte: () => self,
      eq: () => self,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: payload(), error: null }).then(resolve),
    };
    return self;
  };
  return {
    serviceClient: {
      from: (table: string) => ({
        select: () =>
          builder(() =>
            table === "connect_teardown_escalations"
              ? h.escalationRows
              : h.rows,
          ),
        update: (patch: Record<string, unknown>) => {
          h.updates.push({ __table: table, ...patch });
          const chain: Record<string, unknown> = {
            eq: () => chain,
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          };
          return chain;
        },
        upsert: (payload: Record<string, unknown>) => {
          h.upserts.push({ __table: table, ...payload });
          return {
            select: () =>
              Promise.resolve({
                // A fresh case each time unless the test says otherwise, so
                // "opened" is the default and the refresh path is opt-in.
                data: h.escalationExists ? [] : [{ id: "esc_1" }],
                error: null,
              }),
          };
        },
      }),
    },
  };
});

import {
  balanceIsZero,
  tearDownConnectAccount,
  runConnectAccountTeardown,
} from "@/lib/server/connect-account-teardown";

const ROW = {
  id: "rec_1",
  stripe_account_id: "acct_1",
  connect_teardown_state: "pending",
};

const ZERO_BALANCE = {
  object: "balance",
  livemode: false,
  available: [{ amount: 0, currency: "eur" }],
  pending: [{ amount: 0, currency: "eur" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.updates = [];
  h.upserts = [];
  h.escalationRows = [];
  h.escalationExists = false;
  h.balanceRetrieve.mockResolvedValue(ZERO_BALANCE);
  h.accountsDel.mockResolvedValue({ id: "acct_1", deleted: true });
});

describe("balanceIsZero", () => {
  it("is true only when every bucket is zero", () => {
    expect(balanceIsZero(ZERO_BALANCE)).toBe(true);
  });

  it("is false on a non-zero AVAILABLE balance", () => {
    expect(
      balanceIsZero({ ...ZERO_BALANCE, available: [{ amount: 500 }] }),
    ).toBe(false);
  });

  it("is false on a non-zero PENDING balance, which `available`-only logic would miss", () => {
    expect(balanceIsZero({ ...ZERO_BALANCE, pending: [{ amount: 500 }] })).toBe(
      false,
    );
  });

  it("is false on a bucket nobody named at build time (e.g. connect_reserved)", () => {
    expect(
      balanceIsZero({ ...ZERO_BALANCE, connect_reserved: [{ amount: 12 }] }),
    ).toBe(false);
  });

  it("is false for an unreadable balance rather than defaulting to deletable", () => {
    expect(balanceIsZero(null)).toBe(false);
  });

  it("ignores the non-amount envelope fields", () => {
    expect(balanceIsZero({ object: "balance", livemode: true })).toBe(true);
  });
});

describe("tearDownConnectAccount", () => {
  it("reads the CONNECTED account's balance, not the platform's", async () => {
    await tearDownConnectAccount(ROW);
    expect(h.balanceRetrieve).toHaveBeenCalledWith(
      {},
      { stripeAccount: "acct_1" },
    );
  });

  it("deletes the account and marks the row completed when the balance is zero", async () => {
    const result = await tearDownConnectAccount(ROW);
    expect(h.accountsDel).toHaveBeenCalledWith("acct_1");
    expect(result.outcome).toBe("completed");
    expect(h.updates).toContainEqual(
      expect.objectContaining({ connect_teardown_state: "completed" }),
    );
  });

  it("DISTINCTION: refuses to delete on a non-zero balance and records why", async () => {
    h.balanceRetrieve.mockResolvedValue({
      ...ZERO_BALANCE,
      pending: [{ amount: 300 }],
    });
    const result = await tearDownConnectAccount(ROW);
    expect(h.accountsDel).not.toHaveBeenCalled();
    expect(result.outcome).toBe("blocked");
    expect(h.updates).toContainEqual(
      expect.objectContaining({
        connect_teardown_state: "blocked",
        connect_teardown_last_error: expect.stringContaining("non-zero"),
      }),
    );
  });

  it("treats an account Stripe no longer knows about as done, not as a permanent block", async () => {
    h.balanceRetrieve.mockRejectedValue(
      Object.assign(new Error("No such account: acct_1"), {
        code: "resource_missing",
      }),
    );
    const result = await tearDownConnectAccount(ROW);
    expect(result.outcome).toBe("completed");
  });

  it("DISTINCTION: any OTHER balance-read failure blocks rather than being read as gone", async () => {
    h.balanceRetrieve.mockRejectedValue(new Error("connection reset"));
    const result = await tearDownConnectAccount(ROW);
    expect(result.outcome).toBe("blocked");
    expect(h.accountsDel).not.toHaveBeenCalled();
  });

  it("a failing delete blocks the row and never claims completion", async () => {
    h.accountsDel.mockRejectedValue(new Error("account has a pending payout"));
    const result = await tearDownConnectAccount(ROW);
    expect(result.outcome).toBe("blocked");
    expect(h.updates).not.toContainEqual(
      expect.objectContaining({ connect_teardown_state: "completed" }),
    );
  });
});

describe("runConnectAccountTeardown", () => {
  it("is a clean no-op with an evidenced zero while nothing has reached window-end", async () => {
    h.rows = [];
    const result = await runConnectAccountTeardown();
    expect(result).toEqual({
      completed: 0,
      blocked: 0,
      escalationsOpened: 0,
      reviewsDue: 0,
    });
    expect(h.balanceRetrieve).not.toHaveBeenCalled();
  });

  it("dry-run contacts Stripe for nothing and writes nothing: deleting an account is not rehearsable", async () => {
    h.rows = [ROW];
    const result = await runConnectAccountTeardown(new Date(), "dry-run");
    expect(result).toEqual({
      completed: 0,
      blocked: 1,
      escalationsOpened: 0,
      reviewsDue: 0,
    });
    expect(h.balanceRetrieve).not.toHaveBeenCalled();
    expect(h.accountsDel).not.toHaveBeenCalled();
    expect(h.updates).toEqual([]);
    // Counsel 7.5: a dry-run must not open a case either. A case is a claim
    // that a specific account's retention is justified; rehearsing it would
    // write that claim without ever having observed the balance.
    expect(h.upserts).toEqual([]);
  });

  it("DISTINCTION: a real run does act on the same row", async () => {
    h.rows = [ROW];
    const result = await runConnectAccountTeardown();
    expect(result).toEqual({
      completed: 1,
      blocked: 0,
      escalationsOpened: 0,
      reviewsDue: 0,
    });
    expect(h.accountsDel).toHaveBeenCalledWith("acct_1");
  });
});
