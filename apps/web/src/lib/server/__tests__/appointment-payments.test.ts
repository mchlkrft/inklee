import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_OVERRIDES,
  ENTITLEMENT_FEATURES,
  type AccountOverrides,
  type EntitlementFeature,
} from "@/lib/entitlements";
import {
  ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES,
  PAYMENT_REQUEST_COLLECTS,
  PAYMENT_REQUEST_STATUSES,
  type PaymentRequestCollects,
} from "@inklee/shared/appointment-payments";
import { ACTIVE_FEE_SCHEDULE_VERSION } from "@inklee/shared/fee-schedule";

// The appointment-payments SERVER boundary (Plus build P9, slice A2). Written
// by a different engineer than the cores, because the author of a money path
// does not certify their own gate.
//
// WHAT IS PINNED HERE, in the order of what would hurt most if it broke:
//
//  1. Every core that ASKS A CLIENT FOR MONEY refuses a lapsed-to-Free artist
//     server-side, before any write, with a specific code and specific copy.
//     And the two cores that STOP money being asked for (cancel, expire) refuse
//     nobody: that asymmetry is a decision, so it is asserted rather than left
//     to be re-derived from an absence.
//  2. The seven-key entitlement mapping HOLDS BOTH WAYS. A key granted on its
//     own unlocks exactly its own core and nothing else, and the four keys A2
//     does not own (`deposits`, `manual_deposit_tracking`,
//     `appointment_payment_refunds`, `appointment_payment_insights`) unlock
//     nothing at all. A gate that is wrong in the permissive direction is
//     invisible to a test that only checks refusals.
//  3. SEND RE-DERIVES ITS GATE FROM THE STORED ROW. That is the whole reason
//     `collects` became a column in 0126, and it is spec section 12's
//     "downgrade after sending a request".
//  4. A sent request is REPLACED, never edited. There is no code path in this
//     module that mutates a frozen row, and the exported surface is pinned so
//     adding one is a deliberate act.
//
// The entitlement engine is the REAL one (`canAccess` composed with real
// `AccountOverrides`); only the account read and the dark-launch kill switch
// are mocked, so a change in how Free resolves shows up here.
//
// The RACE is not here. It is not reachable without two connections overlapping
// in time: `tests/db/payment-request-concurrent-send.test.ts` (two senders, one
// appointment) and `tests/db/payment-request-send-race.test.ts` (a settlement
// racing a send) own it.
//
// ---------------------------------------------------------------------------
// EXECUTED, RED FIRST. Every claim above was checked by breaking the thing it
// describes and recording what went red, because a suite written after the code
// is green by construction. 18 single changes (16 to
// `server/appointment-payments.ts`, one to the shared model, one to `0126`),
// each run twice: once with this file EXCLUDED, once with it included.
//
// EVERY ONE OF THE 18 LEFT THE PRE-EXISTING SUITE AT 2177/2177 PASSED. These
// cores shipped with no tests of any kind and nothing else imports them, so that
// is the expected answer rather than a surprising one; it is recorded because it
// is the measurement that says this file is load-bearing rather than decorative.
// What each mutation turned red here:
//
//   the gate computed and then ignored in create   12  incl. every
//                                                      individually-granted key
//   cancel reading zero rows as success             6
//   `expired` added to the expirable statuses       4
//   the platform pause no longer pausing            4
//   send gating on an ASSUMED purpose               3  one of them because the
//                                                      refusal named the wrong plan key
//   `paid` added to the expirable statuses          3
//   an unknown RPC verdict treated as a send        2
//   0126 renaming a verdict token                   2
//   a verdict losing its mapping                    2
//   send assuming one line instead of counting      1
//   the 23505 branch removed                        1
//   cancel losing its status floor                  1
//   expiry losing the null-expiry guard             1
//   revise cancelling the predecessor at revise     1
//   revise accepting an unsent request              1
//   a caller-supplied line total trusted            1
//   an updatePaymentRequestCore added               1
//   `paid` added to the artist-cancellable set      1

const getAccountOverrides = vi.fn();
/** The dark-launch kill switch, driven by a list rather than a return value so
 *  a paused test cannot accidentally pause every capability. */
let disabledCapabilities: string[] = [];
const isCapabilityDisabled = vi.fn((capability: string) =>
  disabledCapabilities.includes(capability),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/app-config", () => ({
  isCapabilityDisabled: (c: string) => isCapabilityDisabled(c),
}));

import * as paymentsModule from "@/lib/server/appointment-payments";
import {
  createPaymentRequestCore,
  revisePaymentRequestCore,
  sendPaymentRequestCore,
  cancelPaymentRequestCore,
  expirePaymentRequestsCore,
  expirePaymentRequestCore,
  collectionEntitlementKey,
  requiredPaymentEntitlements,
  missingPaymentEntitlement,
  MAX_PAYMENT_REQUEST_LINES,
  DEFAULT_PAYMENT_REQUEST_TTL_DAYS,
  type PaymentRequestWriteResult,
} from "@/lib/server/appointment-payments";

// ---------------------------------------------------------------------------
// A recording Supabase double, adapted from collections.test.ts.
//
// The recording half is the point. These cores express their ownership and
// their money floor as FILTERS (`.eq("artist_id", …)`, `.in("status", …)`), and
// a filter that is silently dropped still returns a clean result from a mock
// that only replays data. Asserting on `ops[n].filters` is the only way a
// dropped scope can fail a unit test.

type Reply = { data?: unknown; error?: unknown; count?: unknown };

type RecordedOp = {
  table: string;
  verb: "select" | "insert" | "update" | "delete";
  /** The row (or rows) handed to insert/update, null for reads and deletes. */
  payload: Record<string, unknown> | Record<string, unknown>[] | null;
  /** Every .eq()/.is()/.lte() column flattened, so a dropped one is observable. */
  filters: Record<string, unknown>;
  inFilter: { column: string; values: unknown[] } | null;
  notFilter: { column: string; operator: string; value: unknown } | null;
  /** The second argument to .select(), which is where `count: exact` lives. */
  selectOptions: unknown;
};

interface Chain extends PromiseLike<Reply> {
  select(columns?: string, options?: unknown): Chain;
  eq(column: string, value: unknown): Chain;
  is(column: string, value: unknown): Chain;
  in(column: string, values: unknown[]): Chain;
  not(column: string, operator: string, value: unknown): Chain;
  lte(column: string, value: unknown): Chain;
  order(column: string, opts?: unknown): Chain;
  maybeSingle(): Promise<Reply>;
  single(): Promise<Reply>;
}

let ops: RecordedOp[] = [];
let replies: Record<string, Reply[]> = {};
let rpcReplies: Reply[] = [];
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

/** Queue answers for a table+verb, consumed in call order. */
function queue(key: string, ...rs: Reply[]) {
  replies[key] = [...(replies[key] ?? []), ...rs];
}

function nextReply(key: string): Reply {
  const q = replies[key];
  if (q && q.length > 0) return q.shift() as Reply;
  return { data: null, error: null };
}

function makeChain(op: RecordedOp): Chain {
  const key = `${op.table}:${op.verb}`;
  const self: Chain = {
    select: (_columns, options) => {
      if (options !== undefined) op.selectOptions = options;
      return self;
    },
    eq: (column, value) => {
      op.filters[column] = value;
      return self;
    },
    is: (column, value) => {
      op.filters[column] = value;
      return self;
    },
    in: (column, values) => {
      op.inFilter = { column, values };
      return self;
    },
    not: (column, operator, value) => {
      op.notFilter = { column, operator, value };
      return self;
    },
    lte: (column, value) => {
      op.filters[`${column}<=`] = value;
      return self;
    },
    order: () => self,
    maybeSingle: () => Promise.resolve(nextReply(key)),
    single: () => Promise.resolve(nextReply(key)),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(nextReply(key)).then(onFulfilled, onRejected),
  };
  return self;
}

function start(
  table: string,
  verb: RecordedOp["verb"],
  payload: RecordedOp["payload"],
): Chain {
  const op: RecordedOp = {
    table,
    verb,
    payload,
    filters: {},
    inFilter: null,
    notFilter: null,
    selectOptions: undefined,
  };
  ops.push(op);
  return makeChain(op);
}

const supabase = {
  from: (table: string) => ({
    select: (_columns?: string, options?: unknown) => {
      const chain = start(table, "select", null);
      return options === undefined ? chain : chain.select(_columns, options);
    },
    insert: (payload: RecordedOp["payload"]) => start(table, "insert", payload),
    update: (payload: Record<string, unknown>) =>
      start(table, "update", payload),
    delete: () => start(table, "delete", null),
  }),
  rpc: (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcReplies.shift() ?? { data: null, error: null });
  },
} as unknown as SupabaseClient;

const ARTIST = "artist-1";
const REQUESTS = "payment_requests";
const LINES = "payment_request_lines";

const PLUS: AccountOverrides = { ...DEFAULT_OVERRIDES, planTier: "plus" };
/** Plus that ran out. `effectivePlanTier` resolves this to free, which is the
 *  realistic shape of a downgrade: the row still says plus. */
const LAPSED_TO_FREE: AccountOverrides = {
  ...DEFAULT_OVERRIDES,
  planTier: "plus",
  planExpiresAt: "2020-01-01T00:00:00.000Z",
};
/** Bare Free plus exactly the named keys, which is how "granted individually"
 *  is expressed: an explicit per-feature override beats the plan baseline. */
function freeWith(...features: EntitlementFeature[]): AccountOverrides {
  return {
    ...DEFAULT_OVERRIDES,
    entitlementOverrides: Object.fromEntries(
      features.map((f) => [f, true]),
    ) as Partial<Record<EntitlementFeature, boolean>>,
  };
}

const ONE_LINE = [
  {
    name: "Tattoo balance",
    classification: "tattoo_service",
    quantity: 1,
    unitAmountMinor: 12_000,
  },
];
const TWO_LINES = [
  ...ONE_LINE,
  { name: "Tip", classification: "tip", quantity: 1, unitAmountMinor: 1_000 },
];

/** The stored row `readRequest` returns, in database column shape. */
function storedRequest(over: Record<string, unknown> = {}) {
  return {
    id: "pr1",
    status: "ready",
    currency: "eur",
    collects: "balance",
    revision: 1,
    booking_id: "bk1",
    project_id: null,
    sent_at: null,
    total_minor: 12_000,
    ...over,
  };
}

/** A request that has been SENT, so revise is the only way to change it. */
function sentRequest(over: Record<string, unknown> = {}) {
  return storedRequest({
    status: "sent",
    sent_at: "2026-07-29T10:00:00.000Z",
    ...over,
  });
}

const writes = () => ops.filter((o) => o.verb !== "select");

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  rpcReplies = [];
  rpcCalls = [];
  getAccountOverrides.mockResolvedValue(PLUS);
  disabledCapabilities = [];
});

// ===========================================================================
// 1. THE GATE. Every core, one test each, asserting the specific refusal.

/** The three cores that ASK A CLIENT FOR MONEY, with the minimum arguments that
 *  reach the gate. The list doubles as the inventory of gated entry points, so
 *  a fourth money-asking core that forgets the gate has to be added here to be
 *  green, which is a conversation rather than an omission. */
const MONEY_ASKING_CORES: Array<
  [string, (s: SupabaseClient) => Promise<PaymentRequestWriteResult>]
> = [
  [
    "createPaymentRequestCore",
    (s) =>
      createPaymentRequestCore(s, ARTIST, {
        subject: { kind: "booking", id: "bk1" },
        collects: "balance",
        lines: ONE_LINE,
      }),
  ],
  [
    "revisePaymentRequestCore",
    (s) => {
      queue(`${REQUESTS}:select`, { data: sentRequest() });
      return revisePaymentRequestCore(s, ARTIST, "pr1", { lines: ONE_LINE });
    },
  ],
  [
    "sendPaymentRequestCore",
    (s) => {
      queue(`${REQUESTS}:select`, { data: storedRequest() });
      queue(`${LINES}:select`, { count: 1, error: null });
      return sendPaymentRequestCore(s, ARTIST, "pr1");
    },
  ],
];

describe("the entitlement gate on every money-asking core", () => {
  it.each(MONEY_ASKING_CORES)(
    "%s refuses a lapsed-to-Free artist, server-side, before any write",
    async (_name, call) => {
      getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
      const r = await call(supabase);
      expect(r).toEqual({
        ok: false,
        code: "not_entitled",
        error:
          "Collecting a remaining balance isn't included in your current plan.",
      });
      // Refused BEFORE, not after. A gate that runs after the write still
      // returns not_entitled while having already changed a row, and on this
      // path "the row" is a client-facing request for money.
      expect(writes(), "no write may have been issued").toEqual([]);
      expect(rpcCalls, "nothing may have been frozen").toEqual([]);
    },
  );

  it.each(MONEY_ASKING_CORES)(
    "%s refuses rather than failing open when the plan cannot be read",
    async (_name, call) => {
      // A failed entitlement READ is an error, never "free plan": resolving a
      // database blip to Free would refuse a comped artist, and resolving it
      // the other way would hand out a capability nobody paid for.
      getAccountOverrides.mockRejectedValue(new Error("db down"));
      const r = await call(supabase);
      expect(r).toEqual({
        ok: false,
        code: "failed",
        error: "Couldn't verify your plan. Please try again.",
      });
      expect(writes()).toEqual([]);
      expect(rpcCalls).toEqual([]);
    },
  );

  it.each(MONEY_ASKING_CORES)(
    "%s refuses an entitled artist while `appointment_payments` is paused",
    async (_name, call) => {
      disabledCapabilities = ["appointment_payments"];
      const r = await call(supabase);
      expect(r).toEqual({
        ok: false,
        code: "not_entitled",
        error: "Payment requests are paused right now. Please try again later.",
      });
      expect(writes()).toEqual([]);
      expect(rpcCalls).toEqual([]);
    },
  );

  it("pauses on the `appointment_payments` name and no other", async () => {
    // A kill switch that matched loosely would pause the whole fleet on an
    // unrelated capability name.
    disabledCapabilities = ["deposits", "goods_collections"];
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    const r = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "balance",
      lines: ONE_LINE,
    });
    expect(r).toEqual({ ok: true, id: "new1", status: "draft" });
    expect(isCapabilityDisabled).toHaveBeenCalledWith("appointment_payments");
  });
});

// The other half of the same decision, and the reason it is a decision:
// stopping a request for money must keep working for an artist who has lapsed,
// and while the whole capability is paused. Asserted, because "cancel has no
// gate" is otherwise indistinguishable from "cancel forgot its gate".
describe("cancel and expire are deliberately UNGATED", () => {
  it("cancelPaymentRequestCore still works for a lapsed-to-Free artist", async () => {
    getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
    queue(`${REQUESTS}:update`, { data: [{ id: "pr1" }], error: null });
    const r = await cancelPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({ ok: true, id: "pr1", status: "cancelled" });
    expect(
      getAccountOverrides,
      "cancel must not even ask what plan the artist is on",
    ).not.toHaveBeenCalled();
  });

  it("cancelPaymentRequestCore still works while the capability is paused", async () => {
    disabledCapabilities = ["appointment_payments"];
    queue(`${REQUESTS}:update`, { data: [{ id: "pr1" }], error: null });
    const r = await cancelPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({ ok: true, id: "pr1", status: "cancelled" });
  });

  it("expirePaymentRequestsCore still works for a lapsed-to-Free artist", async () => {
    getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
    queue(`${REQUESTS}:update`, { data: [{ id: "pr1" }], error: null });
    const r = await expirePaymentRequestsCore(supabase, ARTIST);
    expect(r).toEqual({ ok: true, expiredIds: ["pr1"] });
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });

  it("expirePaymentRequestsCore still works while the capability is paused", async () => {
    // Stronger than cancel's version: expiry runs unattended, so a paused
    // capability that stopped it would leave payable links alive indefinitely.
    disabledCapabilities = ["appointment_payments"];
    queue(`${REQUESTS}:update`, { data: [{ id: "pr1" }], error: null });
    const r = await expirePaymentRequestsCore(supabase, ARTIST);
    expect(r).toEqual({ ok: true, expiredIds: ["pr1"] });
  });
});

// ===========================================================================
// 2. THE ENTITLEMENT MAPPING, both directions.

describe("collectionEntitlementKey / requiredPaymentEntitlements", () => {
  it("maps each `collects` value to its own key and no other", async () => {
    expect(collectionEntitlementKey("deposit")).toBe("card_deposit_collection");
    expect(collectionEntitlementKey("balance")).toBe(
      "appointment_balance_collection",
    );
    expect(collectionEntitlementKey("full_price")).toBe(
      "full_appointment_payment_collection",
    );
  });

  it("covers every `collects` value the model allows", async () => {
    // An unmapped value would return undefined and gate on nothing at all.
    for (const collects of PAYMENT_REQUEST_COLLECTS) {
      expect(
        collectionEntitlementKey(collects),
        `${collects} has no entitlement key`,
      ).toBeTruthy();
    }
  });

  it("adds the itemization key at MORE than one line, and not at one", async () => {
    expect(requiredPaymentEntitlements("deposit", 1)).toEqual([
      "card_deposit_collection",
    ]);
    expect(requiredPaymentEntitlements("deposit", 2)).toEqual([
      "card_deposit_collection",
      "appointment_payment_line_items",
    ]);
    expect(requiredPaymentEntitlements("deposit", 20)).toContain(
      "appointment_payment_line_items",
    );
  });

  it("never requires a key A2 does not own", async () => {
    // The four keys P9 slice A2 must never read: the legacy broad key, the Free
    // manual baseline, A5's refunds and P6's insights. A gate that quietly
    // required `deposits` would re-couple this to the path P7 is meant to
    // migrate; one that required `manual_deposit_tracking` would gate a CARD
    // instrument on the key whose whole meaning is "no card".
    const everRequired = new Set<EntitlementFeature>();
    for (const collects of PAYMENT_REQUEST_COLLECTS) {
      for (const lineCount of [1, 2, MAX_PAYMENT_REQUEST_LINES]) {
        for (const key of requiredPaymentEntitlements(collects, lineCount)) {
          everRequired.add(key);
        }
      }
    }
    expect([...everRequired].sort()).toEqual([
      "appointment_balance_collection",
      "appointment_payment_line_items",
      "card_deposit_collection",
      "full_appointment_payment_collection",
    ]);
  });

  it("reports the FIRST missing key, so the message names the real blocker", async () => {
    const onlyLineItems = freeWith("appointment_payment_line_items");
    expect(missingPaymentEntitlement(onlyLineItems, "deposit", 2)).toBe(
      "card_deposit_collection",
    );
    const onlyDeposit = freeWith("card_deposit_collection");
    expect(missingPaymentEntitlement(onlyDeposit, "deposit", 2)).toBe(
      "appointment_payment_line_items",
    );
    expect(missingPaymentEntitlement(onlyDeposit, "deposit", 1)).toBeNull();
  });
});

describe("a key granted individually unlocks exactly its own core", () => {
  const COLLECTION_KEYS: Array<[PaymentRequestCollects, EntitlementFeature]> = [
    ["deposit", "card_deposit_collection"],
    ["balance", "appointment_balance_collection"],
    ["full_price", "full_appointment_payment_collection"],
  ];

  async function createWith(
    overrides: AccountOverrides,
    collects: PaymentRequestCollects,
    lines: unknown[],
  ) {
    getAccountOverrides.mockResolvedValue(overrides);
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    return createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects,
      lines,
    });
  }

  it.each(COLLECTION_KEYS)(
    "`%s` is unlocked by its own key alone",
    async (collects, key) => {
      const r = await createWith(freeWith(key), collects, ONE_LINE);
      expect(r).toEqual({ ok: true, id: "new1", status: "draft" });
    },
  );

  it.each(COLLECTION_KEYS)(
    "`%s` is refused when only the OTHER two collection keys are granted",
    async (collects, key) => {
      const others = COLLECTION_KEYS.map(([, k]) => k).filter((k) => k !== key);
      const r = await createWith(freeWith(...others), collects, ONE_LINE);
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ code: "not_entitled" });
      expect(writes(), "an ungranted collection must write nothing").toEqual(
        [],
      );
    },
  );

  it("the itemization key on its own unlocks nothing", async () => {
    for (const [collects] of COLLECTION_KEYS) {
      ops = [];
      const r = await createWith(
        freeWith("appointment_payment_line_items"),
        collects,
        ONE_LINE,
      );
      expect(
        r,
        `${collects} was unlocked by the itemization key`,
      ).toMatchObject({ ok: false, code: "not_entitled" });
    }
  });

  it("a collection key alone does NOT unlock a second line", async () => {
    const r = await createWith(
      freeWith("card_deposit_collection"),
      "deposit",
      TWO_LINES,
    );
    expect(r).toEqual({
      ok: false,
      code: "not_entitled",
      error: "Extra payment lines aren't included in your current plan.",
    });
    expect(writes()).toEqual([]);
  });

  it("a collection key PLUS the itemization key unlocks a second line", async () => {
    // The positive control for the test above: without it, a gate that refused
    // every multi-line request for any reason would pass.
    const r = await createWith(
      freeWith("card_deposit_collection", "appointment_payment_line_items"),
      "deposit",
      TWO_LINES,
    );
    expect(r).toEqual({ ok: true, id: "new1", status: "draft" });
  });

  // The permissive direction, which a refusal-only suite cannot see.
  const NON_A2_KEYS: EntitlementFeature[] = [
    "deposits",
    "manual_deposit_tracking",
    "appointment_payment_refunds",
    "appointment_payment_insights",
  ];

  it.each(NON_A2_KEYS)("`%s` unlocks nothing in this module", async (key) => {
    for (const [collects] of COLLECTION_KEYS) {
      ops = [];
      const r = await createWith(freeWith(key), collects, ONE_LINE);
      expect(
        r,
        `${key} unlocked a ${collects} request it does not gate`,
      ).toMatchObject({ ok: false, code: "not_entitled" });
    }
  });

  it("a bare Free artist holds none of the four keys A2 gates on", async () => {
    // The baseline the four tests above are measured against. If Free ever
    // grants one of these, every "refused" result above becomes vacuous.
    for (const [collects, key] of COLLECTION_KEYS) {
      expect(
        missingPaymentEntitlement(DEFAULT_OVERRIDES, collects, 1),
        `Free unexpectedly holds ${key}`,
      ).toBe(key);
    }
    expect(
      missingPaymentEntitlement(
        freeWith("card_deposit_collection"),
        "deposit",
        2,
      ),
    ).toBe("appointment_payment_line_items");
  });

  it("every one of the seven payment keys is a real entitlement feature", async () => {
    // Guards the whole matrix above against a typo silently testing a key that
    // does not exist: `canAccess` on an unknown key is simply false, so a
    // misspelled grant would look like a correct refusal.
    const SEVEN = [
      "manual_deposit_tracking",
      "card_deposit_collection",
      "appointment_balance_collection",
      "full_appointment_payment_collection",
      "appointment_payment_line_items",
      "appointment_payment_refunds",
      "appointment_payment_insights",
    ];
    for (const key of SEVEN) {
      expect(
        (ENTITLEMENT_FEATURES as readonly string[]).includes(key),
        `${key} is not in ENTITLEMENT_FEATURES`,
      ).toBe(true);
    }
  });
});

// ===========================================================================
// 3. CREATE. What is written, and what is refused before anything is.

describe("createPaymentRequestCore", () => {
  it("writes a DRAFT that is not payable and carries no freeze evidence", async () => {
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "deposit",
      lines: ONE_LINE,
    });
    const insert = ops.find((o) => o.table === REQUESTS && o.verb === "insert");
    const payload = insert?.payload as Record<string, unknown>;
    expect(payload.artist_id).toBe(ARTIST);
    expect(payload.status).toBe("draft");
    expect(payload.collects).toBe("deposit");
    expect(payload.booking_id).toBe("bk1");
    expect(payload.project_id).toBeNull();
    expect(payload.revision).toBe(1);
    // A draft cannot be born already sent, already priced against a fee
    // schedule, or already expiring: those are the freeze's evidence and the
    // freeze has not happened.
    expect(payload).not.toHaveProperty("sent_at");
    expect(payload).not.toHaveProperty("fee_schedule_version");
    expect(payload).not.toHaveProperty("expires_at");
    expect(payload).not.toHaveProperty("supersedes_id");
  });

  it("COMPUTES every line total instead of trusting the caller", async () => {
    // A caller-supplied total that disagreed with unit x quantity is a price
    // the client would see one of and be charged the other.
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "deposit",
      lines: [
        {
          name: "Session",
          classification: "tattoo_service",
          quantity: 3,
          unitAmountMinor: 5_000,
          lineTotalMinor: 1,
          line_total_minor: 1,
          total_minor: 1,
        },
      ],
    });
    const insert = ops.find((o) => o.table === REQUESTS && o.verb === "insert");
    expect((insert?.payload as Record<string, unknown>).total_minor).toBe(
      15_000,
    );
    const lineInsert = ops.find(
      (o) => o.table === LINES && o.verb === "insert",
    );
    const rows = lineInsert?.payload as Record<string, unknown>[];
    expect(rows[0].line_total_minor).toBe(15_000);
    expect(rows[0].artist_id).toBe(ARTIST);
    expect(rows[0].currency).toBe("eur");
  });

  it("refuses a caller-supplied status, however it is spelled", async () => {
    // The INSERT policy would refuse a `sent` row loudly, but a core that
    // forwarded arbitrary keys would also forward `sent_at`. Nothing from the
    // input reaches the row except the fields this core chooses.
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    const hostile: Record<string, unknown> = {
      subject: { kind: "booking", id: "bk1" },
      collects: "deposit",
      lines: ONE_LINE,
      status: "paid",
      sent_at: "2020-01-01T00:00:00.000Z",
      artist_id: "someone-else",
    };
    await createPaymentRequestCore(supabase, ARTIST, hostile);
    const insert = ops.find((o) => o.table === REQUESTS && o.verb === "insert");
    const payload = insert?.payload as Record<string, unknown>;
    expect(payload.status).toBe("draft");
    expect(payload.artist_id).toBe(ARTIST);
    expect(payload).not.toHaveProperty("sent_at");
  });

  it("refuses a request with no subject, before the plan is even read", async () => {
    const r = await createPaymentRequestCore(supabase, ARTIST, {
      collects: "deposit",
      lines: ONE_LINE,
    });
    expect(r).toEqual({
      ok: false,
      code: "invalid",
      error: "Pick the appointment or project this payment is for.",
    });
    expect(ops).toEqual([]);
  });

  it("refuses a request that does not say what it collects", async () => {
    const r = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      lines: ONE_LINE,
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(ops).toEqual([]);
  });

  it("refuses a `collects` value the schema would reject", async () => {
    const r = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "tip",
      lines: ONE_LINE,
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(ops).toEqual([]);
  });

  it("refuses a total of zero or less rather than writing a 0.00 request", async () => {
    const r = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "deposit",
      lines: [
        {
          name: "Session",
          classification: "tattoo_service",
          unitAmountMinor: 5_000,
        },
        { name: "Off", classification: "discount", unitAmountMinor: -5_000 },
      ],
    });
    expect(r).toEqual({
      ok: false,
      code: "invalid",
      error: "A payment request has to add up to more than zero.",
    });
    expect(ops).toEqual([]);
  });

  it("refuses a negative line that is not a discount, and a positive discount", async () => {
    const negativeTip = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "deposit",
      lines: [{ name: "Tip", classification: "tip", unitAmountMinor: -5_000 }],
    });
    expect(negativeTip).toEqual({
      ok: false,
      code: "invalid",
      error: "Only a discount line can be a negative amount.",
    });
    const positiveDiscount = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "deposit",
      lines: [
        { name: "Off", classification: "discount", unitAmountMinor: 5_000 },
      ],
    });
    expect(positiveDiscount).toEqual({
      ok: false,
      code: "invalid",
      error: "A discount line has to be a negative amount.",
    });
    expect(ops).toEqual([]);
  });

  it("refuses a missing amount instead of charging zero for the line", async () => {
    for (const unitAmountMinor of [undefined, null, "", "abc", 12.5]) {
      ops = [];
      const r = await createPaymentRequestCore(supabase, ARTIST, {
        subject: { kind: "booking", id: "bk1" },
        collects: "deposit",
        lines: [
          {
            name: "Session",
            classification: "tattoo_service",
            unitAmountMinor,
          },
        ],
      });
      expect(r, `${String(unitAmountMinor)} was accepted`).toEqual({
        ok: false,
        code: "invalid",
        error: "Enter an amount for every line.",
      });
      expect(ops).toEqual([]);
    }
  });

  // A HOSTILE AMOUNT IS REFUSED, NEVER THROWN. `Number.isSafeInteger` on the
  // unit and on the quantity SEPARATELY both pass for values whose PRODUCT is
  // not a safe integer, and the product is what `lineTotalMinor` returns
  // unchecked and `requestTotalMinor` then asserts. Before the bound below,
  // `{ quantity: 2, unitAmountMinor: Number.MAX_SAFE_INTEGER }` escaped this
  // module's error contract as
  // `TypeError: lineTotalMinor must be an integer number of minor units,
  // received 18014398509481982`, while a plain over-int32 amount was handled
  // cleanly. A money path that refuses one and throws on the other does not
  // have an error contract.
  //
  // The bound mirrors the SCHEMA: `unit_amount_minor`, `line_total_minor` and
  // `total_minor` are all `integer` in 0125, so anything above 2147483647 is a
  // row Postgres will not store either way.
  const HOSTILE_LINES: Array<[string, unknown[]]> = [
    [
      "a product that overflows a safe integer",
      [
        {
          name: "Session",
          classification: "tattoo_service",
          quantity: 2,
          unitAmountMinor: Number.MAX_SAFE_INTEGER,
        },
      ],
    ],
    [
      "a unit amount above the integer column",
      [
        {
          name: "Session",
          classification: "tattoo_service",
          unitAmountMinor: 2_147_483_648,
        },
      ],
    ],
    [
      "a quantity that carries the line total above the integer column",
      [
        {
          name: "Session",
          classification: "tattoo_service",
          quantity: 1_000_000,
          unitAmountMinor: 100_000,
        },
      ],
    ],
    [
      "a discount below the integer column",
      [
        {
          name: "Off",
          classification: "discount",
          unitAmountMinor: -2_147_483_648,
        },
      ],
    ],
    [
      "two lines that are each fine and together are not",
      [
        {
          name: "Session",
          classification: "tattoo_service",
          unitAmountMinor: 2_000_000_000,
        },
        {
          name: "Tip",
          classification: "tip",
          unitAmountMinor: 2_000_000_000,
        },
      ],
    ],
  ];

  it.each(HOSTILE_LINES)(
    "refuses %s instead of throwing",
    async (_label, lines) => {
      const r = await createPaymentRequestCore(supabase, ARTIST, {
        subject: { kind: "booking", id: "bk1" },
        collects: "deposit",
        lines,
      });
      expect(r).toMatchObject({ ok: false, code: "invalid" });
      // The sentence has to be actionable, not a type name leaking out.
      expect(r.ok ? "" : r.error).toMatch(/too (large|much)|lower/i);
      expect(ops, "nothing may have been written").toEqual([]);
    },
  );

  it("refuses more lines than the bound allows", async () => {
    const many = Array.from({ length: MAX_PAYMENT_REQUEST_LINES + 1 }, () => ({
      name: "Session",
      classification: "tattoo_service",
      unitAmountMinor: 100,
    }));
    const r = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "deposit",
      lines: many,
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(ops).toEqual([]);
  });

  it("discards its own half-built draft when the lines cannot be saved", async () => {
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    queue(`${LINES}:insert`, { error: { message: "boom" } });
    const r = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "deposit",
      lines: ONE_LINE,
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    const discard = ops.find(
      (o) => o.table === REQUESTS && o.verb === "delete",
    );
    expect(discard?.filters).toEqual({ id: "new1", artist_id: ARTIST });
  });

  it("scopes the line write to the artist as well as the request", async () => {
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "deposit",
      lines: ONE_LINE,
    });
    const clear = ops.find((o) => o.table === LINES && o.verb === "delete");
    expect(clear?.filters).toEqual({ request_id: "new1", artist_id: ARTIST });
  });
});

// ===========================================================================
// 4. IMMUTABLE REVISION. A sent request is replaced, never edited.

describe("a sent request can only be REPLACED", () => {
  it("exports no core that edits an existing request", async () => {
    // The surface is pinned deliberately. "There is no edit path" is a claim
    // about what does NOT exist, and the only way to keep it true is to make
    // adding one fail a test. A new export here is a conversation, not a diff
    // nobody reads.
    expect(
      Object.keys(paymentsModule)
        .filter((k) => typeof (paymentsModule as never)[k] === "function")
        .sort(),
    ).toEqual([
      "cancelPaymentRequestCore",
      "collectionEntitlementKey",
      "createPaymentRequestCore",
      "expirePaymentRequestCore",
      "expirePaymentRequestsCore",
      "missingPaymentEntitlement",
      "requiredPaymentEntitlements",
      "revisePaymentRequestCore",
      "sendPaymentRequestCore",
    ]);
  });

  it("revise creates a SUCCESSOR and leaves the predecessor completely alone", async () => {
    queue(`${REQUESTS}:select`, { data: sentRequest({ revision: 2 }) });
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    const r = await revisePaymentRequestCore(supabase, ARTIST, "pr1", {
      lines: [
        {
          name: "Tattoo balance",
          classification: "tattoo_service",
          unitAmountMinor: 30_000,
        },
      ],
    });
    expect(r).toEqual({ ok: true, id: "new1", status: "draft" });

    const insert = ops.find((o) => o.table === REQUESTS && o.verb === "insert");
    const payload = insert?.payload as Record<string, unknown>;
    expect(payload.supersedes_id).toBe("pr1");
    expect(payload.revision).toBe(3);
    expect(payload.status).toBe("draft");
    expect(payload.total_minor).toBe(30_000);
    expect(payload.booking_id).toBe("bk1");

    // THE POINT. Nothing touched the predecessor: no update, no cancel, no
    // delete, and its lines were not cleared. The client still has exactly the
    // request they were given until the replacement is actually sent.
    expect(
      ops.filter((o) => o.verb === "update"),
      "revise must not update anything",
    ).toEqual([]);
    const deletes = ops.filter((o) => o.verb === "delete");
    expect(deletes).toHaveLength(1);
    expect(
      deletes[0].filters,
      "the line clear must target the NEW request, never the predecessor",
    ).toEqual({ request_id: "new1", artist_id: ARTIST });
  });

  it("revise refuses an UNSENT request and points at editing it directly", async () => {
    queue(`${REQUESTS}:select`, { data: storedRequest({ sent_at: null }) });
    const r = await revisePaymentRequestCore(supabase, ARTIST, "pr1", {
      lines: ONE_LINE,
    });
    expect(r).toEqual({
      ok: false,
      code: "invalid",
      error:
        "This payment request hasn't been sent yet, so you can edit it directly.",
    });
    expect(writes()).toEqual([]);
  });

  it("revise refuses a predecessor that has money on it", async () => {
    for (const status of [
      "payment_processing",
      "partially_paid",
      "paid",
      "partially_refunded",
      "refunded",
      "disputed",
    ]) {
      ops = [];
      replies = {};
      queue(`${REQUESTS}:select`, { data: sentRequest({ status }) });
      const r = await revisePaymentRequestCore(supabase, ARTIST, "pr1", {
        lines: ONE_LINE,
      });
      expect(r, `${status} was accepted as replaceable`).toEqual({
        ok: false,
        code: "settled",
        error:
          "This payment request already has a payment against it, so it can't be replaced. Refund it first if the amount needs to change.",
      });
      expect(writes()).toEqual([]);
    }
  });

  it("revise INHERITS the currency and ignores a caller trying to change it", async () => {
    // The composite FK on supersedes_id binds (id, artist_id, currency), so a
    // revision in another currency is not a row Postgres will store. Refusing
    // to read the field at all is the version of that with a better message.
    queue(`${REQUESTS}:select`, { data: sentRequest({ currency: "eur" }) });
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    await revisePaymentRequestCore(supabase, ARTIST, "pr1", {
      currency: "usd",
      lines: ONE_LINE,
    });
    const insert = ops.find((o) => o.table === REQUESTS && o.verb === "insert");
    expect((insert?.payload as Record<string, unknown>).currency).toBe("eur");
    const lineRows = (
      ops.find((o) => o.table === LINES && o.verb === "insert")
        ?.payload as Record<string, unknown>[]
    )[0];
    expect(lineRows.currency).toBe("eur");
  });

  it("revise carries the predecessor's lines when none are supplied", async () => {
    queue(`${REQUESTS}:select`, { data: sentRequest() });
    queue(`${LINES}:select`, {
      data: [
        {
          name: "Tattoo balance",
          description: null,
          quantity: 1,
          unit_amount_minor: 12_000,
          line_total_minor: 12_000,
          classification: "tattoo_service",
          tax_treatment: "unspecified",
          product_id: null,
          source: "artist_manual",
          position: 3,
        },
      ],
      error: null,
    });
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    const r = await revisePaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({ ok: true, id: "new1", status: "draft" });
    const rows = ops.find((o) => o.table === LINES && o.verb === "insert")
      ?.payload as Record<string, unknown>[];
    expect(rows[0].line_total_minor).toBe(12_000);
    // Renumbered, so a gap left by an earlier edit does not travel forward.
    expect(rows[0].position).toBe(0);
  });

  it("revise FAILS LOUD rather than producing an empty revision when the line read errors", async () => {
    // An empty result from a failed read would be a revision for zero against a
    // client who was quoted an amount, and the freeze would refuse it later
    // with a message about totals rather than about the read.
    queue(`${REQUESTS}:select`, { data: sentRequest() });
    queue(`${LINES}:select`, { data: null, error: { message: "boom" } });
    const r = await revisePaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({
      ok: false,
      code: "failed",
      error: "Couldn't read the current payment lines.",
    });
    expect(writes()).toEqual([]);
  });

  it("revise refuses a hostile amount instead of throwing", async () => {
    // Same bound as create, asserted separately because revise reaches
    // `validateLines` through its own branch and a fix applied to one caller
    // would leave the other one throwing.
    queue(`${REQUESTS}:select`, { data: sentRequest() });
    const r = await revisePaymentRequestCore(supabase, ARTIST, "pr1", {
      lines: [
        {
          name: "Session",
          classification: "tattoo_service",
          quantity: 2,
          unitAmountMinor: Number.MAX_SAFE_INTEGER,
        },
      ],
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(writes(), "nothing may have been written").toEqual([]);
  });

  it("revise keeps a read error and an absent row apart", async () => {
    queue(`${REQUESTS}:select`, { data: null, error: { message: "boom" } });
    expect(await revisePaymentRequestCore(supabase, ARTIST, "pr1")).toEqual({
      ok: false,
      code: "failed",
      error: "Couldn't load that payment request. Please try again.",
    });
    replies = {};
    queue(`${REQUESTS}:select`, { data: null, error: null });
    expect(await revisePaymentRequestCore(supabase, ARTIST, "pr1")).toEqual({
      ok: false,
      code: "not_found",
      error: "That payment request is gone.",
    });
  });

  it("revise reads only the CALLING artist's request", async () => {
    queue(`${REQUESTS}:select`, { data: sentRequest() });
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    await revisePaymentRequestCore(supabase, ARTIST, "pr1", {
      lines: ONE_LINE,
    });
    const read = ops.find((o) => o.table === REQUESTS && o.verb === "select");
    expect(read?.filters).toEqual({ id: "pr1", artist_id: ARTIST });
  });

  it("a revision is gated again, on ITS OWN shape", async () => {
    // The artist was entitled when the predecessor was sent. Adding a second
    // line to the replacement is a new capability, and the fact that something
    // was already sent does not carry it.
    getAccountOverrides.mockResolvedValue(
      freeWith("appointment_balance_collection"),
    );
    queue(`${REQUESTS}:select`, { data: sentRequest() });
    const r = await revisePaymentRequestCore(supabase, ARTIST, "pr1", {
      lines: TWO_LINES,
    });
    expect(r).toEqual({
      ok: false,
      code: "not_entitled",
      error: "Extra payment lines aren't included in your current plan.",
    });
    expect(writes()).toEqual([]);
  });
});

// ===========================================================================
// 5. SEND. The gate is re-derived from the STORED row, and the RPC is the only
// way the freeze happens.

describe("sendPaymentRequestCore", () => {
  function queueSendable(over: Record<string, unknown> = {}, count = 1) {
    queue(`${REQUESTS}:select`, { data: storedRequest(over) });
    queue(`${LINES}:select`, { count, error: null });
  }

  it("freezes through the RPC and never with a direct update", async () => {
    // Through PostgREST the cancel and the freeze would be two transactions,
    // and a freeze that failed after the cancel committed would destroy the
    // artist's outstanding request and send nothing. If this ever becomes two
    // round trips, this test is the one that says so.
    queueSendable();
    rpcReplies = [{ data: "sent" }];
    const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({ ok: true, id: "pr1", status: "sent" });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("send_payment_request");
    expect(writes(), "the freeze may not be written from here").toEqual([]);
  });

  it("passes the artist, the request and the ACTIVE fee schedule version", async () => {
    queueSendable();
    rpcReplies = [{ data: "sent" }];
    await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(rpcCalls[0].args).toMatchObject({
      p_request_id: "pr1",
      p_artist_id: ARTIST,
      p_fee_schedule_version: ACTIVE_FEE_SCHEDULE_VERSION,
    });
  });

  it("defaults the link's life to the declared TTL", async () => {
    queueSendable();
    rpcReplies = [{ data: "sent" }];
    const before = Date.now();
    await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    const expires = new Date(String(rpcCalls[0].args.p_expires_at)).getTime();
    const ttlMs = DEFAULT_PAYMENT_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000;
    expect(expires).toBeGreaterThanOrEqual(before + ttlMs - 5_000);
    expect(expires).toBeLessThanOrEqual(Date.now() + ttlMs + 5_000);
  });

  it("refuses an expiry that is already past, rather than sending a dead link", async () => {
    queueSendable();
    const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1", {
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    expect(r).toEqual({
      ok: false,
      code: "invalid",
      error: "The expiry date has to be in the future.",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("refuses an unparseable expiry", async () => {
    queueSendable();
    const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1", {
      expiresAt: "not-a-date",
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(rpcCalls).toEqual([]);
  });

  it("refuses a stored request that does not say what it collects", async () => {
    queue(`${REQUESTS}:select`, { data: storedRequest({ collects: null }) });
    const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(rpcCalls).toEqual([]);
  });

  // --- the re-derivation, which is why `collects` is a column ---------------

  it("gates on the STORED `collects`, not on what the artist could create", async () => {
    // Spec section 12, "downgrade after sending a request", in its sharpest
    // form: this artist may collect deposits and nothing else, and the stored
    // request collects a full price. A gate that trusted its arguments, or that
    // only ran at create, would send this.
    getAccountOverrides.mockResolvedValue(freeWith("card_deposit_collection"));
    queueSendable({ collects: "full_price" });
    const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({
      ok: false,
      code: "not_entitled",
      error:
        "Collecting the full appointment price isn't included in your current plan.",
    });
    expect(rpcCalls, "nothing may have been frozen").toEqual([]);
  });

  it("gates on the STORED line count, counted rather than trusted", async () => {
    getAccountOverrides.mockResolvedValue(
      freeWith("appointment_balance_collection"),
    );
    queueSendable({}, 2);
    const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({
      ok: false,
      code: "not_entitled",
      error: "Extra payment lines aren't included in your current plan.",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("counts the lines with a real count query, scoped to the artist", async () => {
    queueSendable();
    rpcReplies = [{ data: "sent" }];
    await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    const countRead = ops.find((o) => o.table === LINES && o.verb === "select");
    expect(countRead?.filters).toEqual({
      request_id: "pr1",
      artist_id: ARTIST,
    });
    expect(countRead?.selectOptions).toEqual({ count: "exact", head: true });
  });

  it("refuses when the line count cannot be read, instead of assuming one line", async () => {
    queue(`${REQUESTS}:select`, { data: storedRequest() });
    queue(`${LINES}:select`, { count: null, error: { message: "boom" } });
    const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({
      ok: false,
      code: "failed",
      error: "Couldn't read the payment lines. Please try again.",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("a downgrade between composing and sending stops the send", async () => {
    // The whole sequence, end to end, because the property is about two moments
    // and not about one call: compose while entitled, lapse, send.
    getAccountOverrides.mockResolvedValue(PLUS);
    queue(`${REQUESTS}:insert`, { data: { id: "new1" } });
    const created = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: "bk1" },
      collects: "balance",
      lines: ONE_LINE,
    });
    expect(created).toEqual({ ok: true, id: "new1", status: "draft" });

    getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
    queueSendable({ id: "new1" });
    const sent = await sendPaymentRequestCore(supabase, ARTIST, "new1");
    expect(sent).toMatchObject({ ok: false, code: "not_entitled" });
    expect(rpcCalls).toEqual([]);
  });

  // --- the verdicts --------------------------------------------------------

  const VERDICTS: Array<[string, { code: string; error: string }]> = [
    ["gone", { code: "not_found", error: "That payment request is gone." }],
    [
      "already_sent",
      { code: "frozen", error: "This payment request has already been sent." },
    ],
    [
      "not_sendable",
      {
        code: "frozen",
        error: "This payment request can't be sent from its current state.",
      },
    ],
    [
      "purpose_missing",
      {
        code: "invalid",
        error:
          "This payment request doesn't say what it collects. Start a new one instead.",
      },
    ],
    [
      "empty",
      {
        code: "invalid",
        error: "There's nothing to collect, so this request can't be sent.",
      },
    ],
    [
      "already_outstanding",
      {
        code: "already_outstanding",
        error:
          "A payment request is already waiting to be paid. Cancel it first, or send a version that replaces it.",
      },
    ],
    [
      "supersedes_gone",
      {
        code: "not_found",
        error:
          "The request this replaces is no longer there. Start a new payment request instead.",
      },
    ],
    [
      "supersedes_foreign",
      {
        code: "invalid",
        // "or project": the RPC branch compares booking_id AND project_id, and
        // A2 supports a project subject, so copy naming only the appointment is
        // wrong for half the rows that can reach it.
        error:
          "This version belongs to a different appointment or project. Start a new payment request instead.",
      },
    ],
    [
      "supersedes_settled",
      {
        code: "settled",
        error:
          "The request this replaces already has a payment against it, so it can't be replaced. Refund it first if the amount needs to change.",
      },
    ],
    [
      "supersedes_changed",
      {
        code: "conflict",
        error: "That payment request changed. Refresh and try again.",
      },
    ],
  ];

  it.each(VERDICTS)(
    "maps the `%s` verdict to its own refusal",
    async (verdict, expected) => {
      queueSendable();
      rpcReplies = [{ data: verdict }];
      const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1");
      expect(r).toEqual({ ok: false, ...expected });
    },
  );

  it("treats an UNKNOWN verdict as a failure, never as a send", async () => {
    // Telling an artist their client can pay when nothing was frozen is the
    // worst available answer, and a `default: success` is one refactor away.
    queueSendable();
    rpcReplies = [{ data: "some_new_token" }];
    const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({
      ok: false,
      code: "failed",
      error: "Couldn't send that payment request. Please try again.",
    });
  });

  it("treats a null verdict as a failure", async () => {
    queueSendable();
    rpcReplies = [{ data: null, error: null }];
    expect(await sendPaymentRequestCore(supabase, ARTIST, "pr1")).toMatchObject(
      {
        ok: false,
        code: "failed",
      },
    );
  });

  it("maps the unique violation to `already_outstanding`", async () => {
    // Spec section 12's "duplicate request" as it arrives under concurrency:
    // the partial unique index is the arbiter, the whole RPC transaction has
    // already rolled back, and nothing was cancelled.
    queueSendable();
    rpcReplies = [{ error: { code: "23505", message: "duplicate key value" } }];
    const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({
      ok: false,
      code: "already_outstanding",
      error:
        "A payment request is already waiting to be paid. Cancel it first, or send a version that replaces it.",
    });
  });

  it("maps a total/lines mismatch at the freeze to a conflict", async () => {
    queueSendable();
    rpcReplies = [
      {
        error: {
          code: "23514",
          message:
            "payment_request_total_mismatch: a sent request total must equal the sum of its lines",
        },
      },
    ];
    expect(await sendPaymentRequestCore(supabase, ARTIST, "pr1")).toEqual({
      ok: false,
      code: "conflict",
      error: "The lines changed while this was sending. Refresh and try again.",
    });
  });

  it("does not read a DIFFERENT 23514 as a lines conflict", async () => {
    queueSendable();
    rpcReplies = [
      {
        error: {
          code: "23514",
          message:
            "payment_request_frozen: a sent request cannot change amount, currency, subject",
        },
      },
    ];
    expect(await sendPaymentRequestCore(supabase, ARTIST, "pr1")).toMatchObject(
      {
        ok: false,
        code: "failed",
      },
    );
  });
});

// The map above is only worth anything if it stays in lockstep with the tokens
// the function actually returns. Read from the migration rather than restated,
// because a restatement is what drifts.
describe("the send verdicts stay in lockstep with migration 0126", () => {
  const sqlPath = fileURLToPath(
    new URL(
      "../../../../supabase/migrations/0126_payment_request_send.sql",
      import.meta.url,
    ),
  );
  const sql = readFileSync(sqlPath, "utf8");
  /** Every `return 'token';` inside the function body. */
  const tokensInSql = [
    ...new Set(
      [...sql.matchAll(/^\s*return\s+'([a-z_]+)';/gm)].map((m) => m[1]),
    ),
  ].sort();

  it("returns exactly the tokens this file pins", async () => {
    expect(tokensInSql).toEqual([
      "already_outstanding",
      "already_sent",
      "empty",
      "gone",
      "not_sendable",
      "purpose_missing",
      "sent",
      "supersedes_changed",
      "supersedes_foreign",
      "supersedes_gone",
      "supersedes_settled",
    ]);
  });

  it("maps every one of them to something other than the unknown-token fallback", async () => {
    const UNKNOWN = {
      ok: false,
      code: "failed",
      error: "Couldn't send that payment request. Please try again.",
    };
    for (const token of tokensInSql) {
      ops = [];
      replies = {};
      queue(`${REQUESTS}:select`, { data: storedRequest() });
      queue(`${LINES}:select`, { count: 1, error: null });
      rpcReplies = [{ data: token }];
      const r = await sendPaymentRequestCore(supabase, ARTIST, "pr1");
      if (token === "sent") {
        expect(r).toEqual({ ok: true, id: "pr1", status: "sent" });
      } else {
        expect(
          r,
          `token '${token}' has no mapping in SEND_REFUSALS`,
        ).not.toEqual(UNKNOWN);
      }
    }
  });
});

// ===========================================================================
// 6. CANCEL. A withdrawal, refused once money is moving.

describe("cancelPaymentRequestCore", () => {
  it("cancels with ONE scoped update carrying the artist-cancellable floor", async () => {
    queue(`${REQUESTS}:update`, { data: [{ id: "pr1" }], error: null });
    const r = await cancelPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({ ok: true, id: "pr1", status: "cancelled" });
    const update = ops.find((o) => o.verb === "update");
    expect(update?.filters).toEqual({ id: "pr1", artist_id: ARTIST });
    expect(update?.inFilter).toEqual({
      column: "status",
      values: [...ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES],
    });
    const payload = update?.payload as Record<string, unknown>;
    expect(payload.status).toBe("cancelled");
    expect(payload).not.toHaveProperty("sent_at");
    expect(payload).not.toHaveProperty("total_minor");
  });

  it("the cancellable floor excludes every state holding or having held money", async () => {
    // Read as a set difference rather than restated, so a status added to the
    // model has to be classified by whoever adds it.
    const cancellable = new Set<string>(
      ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES,
    );
    for (const status of [
      "payment_processing",
      "partially_paid",
      "paid",
      "partially_refunded",
      "refunded",
      "disputed",
      "cancelled",
    ]) {
      expect(
        cancellable.has(status),
        `${status} must not be artist-cancellable`,
      ).toBe(false);
    }
    for (const status of PAYMENT_REQUEST_STATUSES) {
      if (!cancellable.has(status)) continue;
      expect(
        ["draft", "ready", "sent", "viewed", "expired", "failed"],
        `${status} was added to the cancellable set without review`,
      ).toContain(status);
    }
  });

  it("refuses a request that is COLLECTING, and says why", async () => {
    // The silent-refusal surface: PostgREST answers an RLS-denied or
    // filtered-out UPDATE with {data: [], error: null}. "No error" is not "it
    // worked", and the reason is read back rather than guessed.
    queue(`${REQUESTS}:update`, { data: [], error: null });
    queue(`${REQUESTS}:select`, {
      data: storedRequest({ status: "payment_processing" }),
    });
    const r = await cancelPaymentRequestCore(supabase, ARTIST, "pr1");
    expect(r).toEqual({
      ok: false,
      code: "settled",
      error:
        "This payment request is already collecting a payment, so it can't be cancelled. Refund it instead once it has gone through.",
    });
  });

  it.each(["paid", "partially_paid", "refunded", "disputed"])(
    "refuses a %s request rather than reporting a successful cancel",
    async (status) => {
      queue(`${REQUESTS}:update`, { data: [], error: null });
      queue(`${REQUESTS}:select`, { data: storedRequest({ status }) });
      expect(
        await cancelPaymentRequestCore(supabase, ARTIST, "pr1"),
      ).toMatchObject({ ok: false, code: "settled" });
    },
  );

  it("is idempotent on an already-cancelled request", async () => {
    queue(`${REQUESTS}:update`, { data: [], error: null });
    queue(`${REQUESTS}:select`, {
      data: storedRequest({ status: "cancelled" }),
    });
    expect(await cancelPaymentRequestCore(supabase, ARTIST, "pr1")).toEqual({
      ok: true,
      id: "pr1",
      status: "cancelled",
    });
  });

  it("reports a missing request as missing, not as settled", async () => {
    queue(`${REQUESTS}:update`, { data: [], error: null });
    queue(`${REQUESTS}:select`, { data: null, error: null });
    expect(await cancelPaymentRequestCore(supabase, ARTIST, "pr1")).toEqual({
      ok: false,
      code: "not_found",
      error: "That payment request is gone.",
    });
  });

  it("reports a failure when the update errors", async () => {
    queue(`${REQUESTS}:update`, { data: null, error: { code: "XX000" } });
    expect(await cancelPaymentRequestCore(supabase, ARTIST, "pr1")).toEqual({
      ok: false,
      code: "failed",
      error: "Couldn't cancel that payment request. Please try again.",
    });
  });
});

// ===========================================================================
// 7. EXPIRE. Idempotent, and unable to resurrect or overwrite an outcome.

describe("expirePaymentRequestsCore", () => {
  it("only ever targets links that are live and past their expiry", async () => {
    queue(`${REQUESTS}:update`, { data: [], error: null });
    await expirePaymentRequestsCore(supabase, ARTIST, {
      now: new Date("2026-07-29T12:00:00.000Z"),
    });
    const update = ops[0];
    expect(update.filters.artist_id).toBe(ARTIST);
    expect(update.inFilter).toEqual({
      column: "status",
      values: ["sent", "viewed", "failed"],
    });
    // A null expiry is not an expired one. Without this filter a request with
    // no expiry at all would compare as due.
    expect(update.notFilter).toEqual({
      column: "expires_at",
      operator: "is",
      value: null,
    });
    expect(update.filters["expires_at<="]).toBe("2026-07-29T12:00:00.000Z");
    expect((update.payload as Record<string, unknown>).status).toBe("expired");
  });

  it("cannot touch a settled, withdrawn or contested request", async () => {
    // The claim is about what is ABSENT from the status filter, so it is read
    // as a set difference over the whole model rather than as a list that could
    // silently gain a member.
    queue(`${REQUESTS}:update`, { data: [], error: null });
    await expirePaymentRequestsCore(supabase, ARTIST);
    const targeted = new Set(ops[0].inFilter?.values as string[]);
    for (const status of PAYMENT_REQUEST_STATUSES) {
      if (["sent", "viewed", "failed"].includes(status)) continue;
      expect(
        targeted.has(status),
        `expiry must never target a ${status} request`,
      ).toBe(false);
    }
    // Named individually as well, because these are the four that would be
    // outright data loss rather than a surprising state change.
    for (const status of ["paid", "cancelled", "refunded", "disputed"]) {
      expect(targeted.has(status)).toBe(false);
    }
  });

  it("is idempotent: `expired` is not in the set it moves out of", async () => {
    queue(`${REQUESTS}:update`, { data: [{ id: "pr1" }], error: null });
    const first = await expirePaymentRequestsCore(supabase, ARTIST);
    expect(first).toEqual({ ok: true, expiredIds: ["pr1"] });
    queue(`${REQUESTS}:update`, { data: [], error: null });
    const second = await expirePaymentRequestsCore(supabase, ARTIST);
    expect(second).toEqual({ ok: true, expiredIds: [] });
    expect(ops[1].inFilter?.values).not.toContain("expired");
  });

  it("reports nothing-was-due honestly rather than as a failure", async () => {
    queue(`${REQUESTS}:update`, { data: [], error: null });
    expect(await expirePaymentRequestCore(supabase, ARTIST, "pr1")).toEqual({
      ok: true,
      expiredIds: [],
    });
  });

  it("narrows to one request when asked, without losing the other filters", async () => {
    queue(`${REQUESTS}:update`, { data: [{ id: "pr1" }], error: null });
    await expirePaymentRequestCore(supabase, ARTIST, "pr1");
    expect(ops[0].filters.id).toBe("pr1");
    expect(ops[0].filters.artist_id).toBe(ARTIST);
    expect(ops[0].inFilter?.values).toEqual(["sent", "viewed", "failed"]);
  });

  it("reports a failure when the update errors", async () => {
    queue(`${REQUESTS}:update`, { data: null, error: { code: "XX000" } });
    expect(await expirePaymentRequestsCore(supabase, ARTIST)).toEqual({
      ok: false,
      code: "failed",
      error: "Couldn't expire those payment requests. Please try again.",
    });
  });
});
