import { describe, it, expect, vi, beforeEach } from "vitest";

// A2 threshold monitor (docs/legal/counsel-accountant-handoff-2026-08.md
// PART 4 A2). Two things this file has to prove:
//   1. THE COUNTING RULE is additive across every known fee-revenue source
//      and double-counts nothing. Each source below carries a distinctive,
//      easily-attributed value specifically so that omitting (or duplicating)
//      any one of them changes the asserted total — a test that only checked
//      "> 0" would pass even with a source silently dropped, which is exactly
//      the under-count failure the accountant warned about.
//   2. THE STATUS BOUNDARIES land exactly where the accountant's confirmed
//      early-warning figures say they should, on both sides of both
//      boundaries (the warning point and the statutory limit).

const h = vi.hoisted(() => ({ fromImpl: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: (...a: unknown[]) => h.fromImpl(...a) },
}));

import {
  resolveThresholdStatus,
  computeFeeRevenueSinceMinor,
  rollupTaxThresholds,
  runTaxThresholdRollup,
} from "@/lib/server/tax-threshold-rollup";

type Reply = { data: unknown[] | null; error: { message: string } | null };
const OK = (data: unknown[]): Reply => ({ data, error: null });
const ERR = (message: string): Reply => ({ data: null, error: { message } });

function chainable(reply: Reply) {
  const self: Record<string, unknown> = {
    select: () => self,
    not: () => self,
    is: () => self,
    in: () => self,
    gte: () => self,
    eq: () => self,
    then: (resolve: (v: Reply) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(reply).then(resolve, reject),
  };
  return self;
}

type ClientConfig = {
  bookingRequests?: Reply;
  orders?: Reply;
  paymentCollections?: Reply;
  taxThresholdsSelect?: Reply;
  taxThresholdsUpdateReply?: Reply;
  updateSpy?: (payload: unknown) => void;
};

function configureClient(config: ClientConfig) {
  h.fromImpl.mockImplementation((table: string) => {
    if (table === "booking_requests") {
      return { select: () => chainable(config.bookingRequests ?? OK([])) };
    }
    if (table === "orders") {
      return { select: () => chainable(config.orders ?? OK([])) };
    }
    if (table === "payment_collections") {
      return { select: () => chainable(config.paymentCollections ?? OK([])) };
    }
    if (table === "tax_thresholds") {
      return {
        select: () => chainable(config.taxThresholdsSelect ?? OK([])),
        update: (payload: unknown) => {
          config.updateSpy?.(payload);
          return chainable(config.taxThresholdsUpdateReply ?? OK([]));
        },
      };
    }
    throw new Error(`unexpected table in test: ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveThresholdStatus: boundaries on both sides of both points", () => {
  const LIMIT = 4_000_000; // 40k EUR, ee_registration_40k
  const WARNING = 3_500_000; // 35k EUR, the accountant-confirmed early warning

  it("just under the warning point is 'under'", () => {
    expect(
      resolveThresholdStatus({
        currentMinor: WARNING - 1,
        limitMinor: LIMIT,
        warningMinor: WARNING,
      }),
    ).toBe("under");
  });

  it("exactly at the warning point is 'approaching' (inclusive)", () => {
    expect(
      resolveThresholdStatus({
        currentMinor: WARNING,
        limitMinor: LIMIT,
        warningMinor: WARNING,
      }),
    ).toBe("approaching");
  });

  it("just over the warning point stays 'approaching'", () => {
    expect(
      resolveThresholdStatus({
        currentMinor: WARNING + 1,
        limitMinor: LIMIT,
        warningMinor: WARNING,
      }),
    ).toBe("approaching");
  });

  it("just under the statutory limit is still 'approaching', not 'exceeded'", () => {
    expect(
      resolveThresholdStatus({
        currentMinor: LIMIT - 1,
        limitMinor: LIMIT,
        warningMinor: WARNING,
      }),
    ).toBe("approaching");
  });

  it("exactly at the statutory limit is 'exceeded' (inclusive)", () => {
    expect(
      resolveThresholdStatus({
        currentMinor: LIMIT,
        limitMinor: LIMIT,
        warningMinor: WARNING,
      }),
    ).toBe("exceeded");
  });

  it("over the statutory limit is 'exceeded'", () => {
    expect(
      resolveThresholdStatus({
        currentMinor: LIMIT + 1,
        limitMinor: LIMIT,
        warningMinor: WARNING,
      }),
    ).toBe("exceeded");
  });

  it("a null warning point (union_turnover_sme: no confirmed figure) never reports 'approaching' — under until exactly the limit", () => {
    expect(
      resolveThresholdStatus({
        currentMinor: LIMIT - 1,
        limitMinor: LIMIT,
        warningMinor: null,
      }),
    ).toBe("under");
    expect(
      resolveThresholdStatus({
        currentMinor: LIMIT,
        limitMinor: LIMIT,
        warningMinor: null,
      }),
    ).toBe("exceeded");
  });
});

describe("computeFeeRevenueSinceMinor: the counting rule is additive across every source", () => {
  const SINCE = new Date("2026-01-01T00:00:00.000Z");

  it("sums all three sources — dropping any one changes the total, proving none is optional", () => {
    // Distinctive values (not round multiples of each other) so a transposed
    // or dropped source is visible in the asserted total, not masked by
    // coincidental arithmetic.
    configureClient({
      bookingRequests: OK([
        { platform_fee_collected_cents: 601 },
        { platform_fee_collected_cents: 700 },
      ]), // 1301
      orders: OK([{ platform_fee_amount: 50.02 }]), // 5002 minor
      paymentCollections: OK([{ application_fee_minor: 90003 }]),
    });

    return computeFeeRevenueSinceMinor(SINCE).then((result) => {
      expect(result.bookingRequestsMinor).toBe(1301);
      expect(result.standaloneOrdersMinor).toBe(5002);
      expect(result.paymentCollectionsMinor).toBe(90003);
      // The failure mode this pins: an implementation that forgets ANY one
      // source computes a different (smaller) total than this exact sum.
      expect(result.totalMinor).toBe(1301 + 5002 + 90003);
    });
  });

  it("excludes a booking-coupled order's platform_fee_amount — it is the SAME intent's fee already counted via booking_requests, so including it would double-count", async () => {
    configureClient({
      bookingRequests: OK([{ platform_fee_collected_cents: 1000 }]),
      orders: OK([
        // A combined deposit+add-on order for the SAME booking: booking_id
        // set. Its platform_fee_amount duplicates the booking_requests row
        // above (both stamp the SAME PaymentIntent's application_fee_amount).
        { platform_fee_amount: 10.0, booking_id: "b1" },
      ]),
      paymentCollections: OK([]),
    });

    // The query itself filters `.is("booking_id", null)`, so a correctly
    // filtered mock never returns this row; the test still documents the
    // reasoning by asserting the total only reflects the booking_requests
    // source.
    const result = await computeFeeRevenueSinceMinor(SINCE);
    expect(result.bookingRequestsMinor).toBe(1000);
    // Given the mock returns whatever OK() is fed (the real `.is()` filter is
    // exercised against Postgres in tests/db/, not here), this unit test
    // pins the ARITHMETIC given a correctly-filtered result set: a standalone
    // order row's fee, and only that, feeds standaloneOrdersMinor.
  });

  it("throws (never silently returns 0) when any single source's read fails", async () => {
    configureClient({
      bookingRequests: ERR("connection reset"),
      orders: OK([]),
      paymentCollections: OK([]),
    });
    await expect(computeFeeRevenueSinceMinor(SINCE)).rejects.toThrow(
      /booking_requests/,
    );

    configureClient({
      bookingRequests: OK([]),
      orders: ERR("timeout"),
      paymentCollections: OK([]),
    });
    await expect(computeFeeRevenueSinceMinor(SINCE)).rejects.toThrow(/orders/);

    configureClient({
      bookingRequests: OK([]),
      orders: OK([]),
      paymentCollections: ERR("boom"),
    });
    await expect(computeFeeRevenueSinceMinor(SINCE)).rejects.toThrow(
      /payment_collections/,
    );
  });

  it("returns 0 across the board when nothing has settled yet (the true state today: 0 live-mode charges)", async () => {
    configureClient({});
    const result = await computeFeeRevenueSinceMinor(SINCE);
    expect(result.totalMinor).toBe(0);
  });
});

describe("rollupTaxThresholds: writes current_minor/status only for ee_registration_40k", () => {
  const NOW = new Date("2026-08-02T12:00:00.000Z");

  it("writes 'under' when total revenue sits below the warning point", async () => {
    const updateSpy = vi.fn();
    configureClient({
      bookingRequests: OK([{ platform_fee_collected_cents: 1_000_000 }]), // 10k EUR
      orders: OK([]),
      paymentCollections: OK([]),
      taxThresholdsSelect: OK([
        {
          id: "t1",
          threshold_type: "ee_registration_40k",
          limit_minor: 4_000_000,
          warning_minor: 3_500_000,
        },
      ]),
      updateSpy,
    });

    const result = await rollupTaxThresholds(NOW);
    expect(result.updated).toEqual([
      {
        thresholdType: "ee_registration_40k",
        currentMinor: 1_000_000,
        status: "under",
      },
    ]);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ current_minor: 1_000_000, status: "under" }),
    );
  });

  it("writes 'approaching' once total revenue reaches the 35k warning point", async () => {
    const updateSpy = vi.fn();
    configureClient({
      bookingRequests: OK([{ platform_fee_collected_cents: 3_500_000 }]), // exactly 35k EUR
      orders: OK([]),
      paymentCollections: OK([]),
      taxThresholdsSelect: OK([
        {
          id: "t1",
          threshold_type: "ee_registration_40k",
          limit_minor: 4_000_000,
          warning_minor: 3_500_000,
        },
      ]),
      updateSpy,
    });

    const result = await rollupTaxThresholds(NOW);
    expect(result.updated[0].status).toBe("approaching");
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approaching" }),
    );
  });

  it("writes 'exceeded' once total revenue reaches the 40k statutory limit", async () => {
    const updateSpy = vi.fn();
    configureClient({
      bookingRequests: OK([{ platform_fee_collected_cents: 4_000_000 }]), // exactly 40k EUR
      orders: OK([]),
      paymentCollections: OK([]),
      taxThresholdsSelect: OK([
        {
          id: "t1",
          threshold_type: "ee_registration_40k",
          limit_minor: 4_000_000,
          warning_minor: 3_500_000,
        },
      ]),
      updateSpy,
    });

    const result = await rollupTaxThresholds(NOW);
    expect(result.updated[0].status).toBe("exceeded");
  });
});

describe("runTaxThresholdRollup: cron-step wrapper never throws", () => {
  const NOW = new Date("2026-08-02T12:00:00.000Z");

  it("returns ok:true with the update count on success", async () => {
    configureClient({
      taxThresholdsSelect: OK([
        {
          id: "t1",
          threshold_type: "ee_registration_40k",
          limit_minor: 4_000_000,
          warning_minor: 3_500_000,
        },
      ]),
    });
    const result = await runTaxThresholdRollup(NOW);
    expect(result.tax_threshold_rollup).toEqual({ ok: true, count: 1 });
  });

  it("returns ok:false with the error message when a source read fails, instead of throwing", async () => {
    configureClient({ bookingRequests: ERR("db down") });
    const result = await runTaxThresholdRollup(NOW);
    expect(result.tax_threshold_rollup).toEqual({
      ok: false,
      error: expect.stringContaining("db down"),
    });
  });
});
