import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// GOODS-DISC-001: getAddonProducts previously never selected `custom_made`
// from `products`, so `computeAddonLines`' `customMade` was silently `false`
// for every add-on line regardless of the artist's actual flag — the
// exemption claim could never fire on this checkout. Named failure mode:
// drop `custom_made` from the select string, or drop the
// `customMade: p.custom_made === true` mapping line, and the assertions
// below fail.

const { mockServiceClient } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));

import {
  getAddonProducts,
  getInterestEligibleProducts,
  PRODUCT_SELECT_COLUMNS,
} from "@/lib/addon-products";

type Reply = { data: unknown; error?: unknown };

// `selectSpy`, when passed, records every `.select(...)` argument issued
// against each table — used by the drift-proofing tests below to prove BOTH
// callers hit the products table with the literal SAME select string, not
// two copies that merely happen to agree today.
function fakeClient(
  replies: Record<string, Reply>,
  selectSpy?: Record<string, string[]>,
) {
  return (table: string) => {
    const builder: Record<string, unknown> = {
      select: (cols?: string) => {
        if (selectSpy) {
          (selectSpy[table] ??= []).push(cols ?? "");
        }
        return builder;
      },
      eq: () => builder,
      order: () => builder,
      single: () =>
        Promise.resolve(replies[table] ?? { data: null, error: null }),
      then: (
        onFulfilled?: (v: Reply) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) =>
        Promise.resolve(replies[table] ?? { data: null, error: null }).then(
          onFulfilled,
          onRejected,
        ),
    };
    return builder;
  };
}

const CHARGE_READY_ARTIST = {
  settings: {},
  stripe_account_status: "active",
  stripe_charges_enabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOODS_COMMERCE_ENABLED", "true");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAddonProducts: custom_made pass-through (GOODS-DISC-001)", () => {
  it("maps customMade: true for a product flagged custom-made", async () => {
    mockServiceClient.from.mockImplementation(
      fakeClient({
        profiles: { data: CHARGE_READY_ARTIST },
        products: {
          data: [
            {
              id: "p1",
              title: "Portrait commission",
              image_url: null,
              price_amount: 40,
              currency: "eur",
              status: "active",
              is_checkout_addon: true,
              quantity: null,
              custom_made: true,
              product_variants: [],
            },
          ],
        },
      }),
    );

    const rows = await getAddonProducts("artist_1");
    expect(rows).toHaveLength(1);
    expect(rows[0].customMade).toBe(true);
  });

  it("maps customMade: false for an unflagged product", async () => {
    mockServiceClient.from.mockImplementation(
      fakeClient({
        profiles: { data: CHARGE_READY_ARTIST },
        products: {
          data: [
            {
              id: "p2",
              title: "Studio shirt",
              image_url: null,
              price_amount: 30,
              currency: "eur",
              status: "active",
              is_checkout_addon: true,
              quantity: null,
              custom_made: false,
              product_variants: [],
            },
          ],
        },
      }),
    );

    const rows = await getAddonProducts("artist_1");
    expect(rows[0].customMade).toBe(false);
  });

  it("defaults to customMade: false when the column is null (pre-C1.2 rows)", async () => {
    mockServiceClient.from.mockImplementation(
      fakeClient({
        profiles: { data: CHARGE_READY_ARTIST },
        products: {
          data: [
            {
              id: "p3",
              title: "A4 print",
              image_url: null,
              price_amount: 15,
              currency: "eur",
              status: "active",
              is_checkout_addon: true,
              quantity: 5,
              custom_made: null,
              product_variants: [],
            },
          ],
        },
      }),
    );

    const rows = await getAddonProducts("artist_1");
    expect(rows[0].customMade).toBe(false);
  });
});

describe("getAddonProducts drop gate (payable path)", () => {
  // 2026-08-02. available_from and preorder were selected and mapped by the
  // INTEREST read but not by this PAYABLE one, so computeAddonLines saw null
  // and productAvailability could never refuse an undropped product on the
  // appointment add-on checkout - while the SAME product was correctly refused
  // on the standalone shop. Same shape as SHOP-DROP-001 (bundles): a column
  // omitted from a SELECT makes a downstream gate silently pass, which no test
  // of the gate itself can catch.
  //
  // FAILS IF either column is dropped from the select string or from the
  // mapping: availableFrom comes back null and the drop time is lost.
  it("carries availableFrom and preorder through to the compositor", async () => {
    mockServiceClient.from.mockImplementation(
      fakeClient({
        profiles: { data: CHARGE_READY_ARTIST },
        products: {
          data: [
            {
              id: "p_drop",
              title: "Future drop",
              image_url: null,
              price_amount: 20,
              currency: "eur",
              status: "active",
              is_checkout_addon: true,
              quantity: 5,
              custom_made: false,
              available_from: "9999-01-01T00:00:00.000Z",
              preorder: false,
              product_variants: [],
            },
          ],
        },
      }),
    );

    const products = await getAddonProducts("artist_1");
    expect(products).toHaveLength(1);
    expect(products[0].availableFrom).toBe("9999-01-01T00:00:00.000Z");
    expect(products[0].preorder).toBe(false);
  });
});

// SHOP-DROP-002 fix, structural half: `getAddonProducts` and
// `getInterestEligibleProducts` used to hand-copy their own `products`
// column list independently, and one copy quietly fell behind the other.
// The fix kills the MECHANISM (one exported constant + one row mapper, both
// callers use it), not just the instance. These tests prove that kill: a
// column deleted from the shared list reds immediately (no DB round trip
// needed), and both callers are proven to hit the products table with the
// literal SAME string, so there is no second copy left to silently drift.
describe("PRODUCT_SELECT_COLUMNS: the ONE shared select list", () => {
  // Every column either function's row mapper (mapProductRow) reads.
  // FAILS IF a column is removed from PRODUCT_SELECT_COLUMNS without this
  // list also being updated — which is the point: the two must be kept in
  // sync by a human looking at both, not by accident.
  const REQUIRED_COLUMNS = [
    "id",
    "title",
    "image_url",
    "price_amount",
    "currency",
    "status",
    "is_checkout_addon",
    "quantity",
    "custom_made",
    "available_from",
    "preorder",
  ];

  it.each(REQUIRED_COLUMNS)("includes the '%s' column", (col) => {
    const topLevelTokens = PRODUCT_SELECT_COLUMNS.split(",").map((t) =>
      t.trim().split("(")[0].trim(),
    );
    expect(topLevelTokens).toContain(col);
  });

  it("embeds product_variants with its own gating columns (status, stock_quantity)", () => {
    expect(PRODUCT_SELECT_COLUMNS).toContain("product_variants(");
    expect(PRODUCT_SELECT_COLUMNS).toContain("stock_quantity");
  });
});

describe("getAddonProducts and getInterestEligibleProducts: one shared select, not two copies", () => {
  it("both currently pass the same string to .select() on products (necessary, not sufficient — see the source-level test below)", async () => {
    const selectCalls: Record<string, string[]> = {};
    mockServiceClient.from.mockImplementation(
      fakeClient(
        { profiles: { data: CHARGE_READY_ARTIST }, products: { data: [] } },
        selectCalls,
      ),
    );

    await getAddonProducts("artist_1");
    const addonProductsSelect = selectCalls.products?.at(-1);

    await getInterestEligibleProducts("artist_1");
    const interestSelect = selectCalls.products?.at(-1);

    expect(addonProductsSelect).toBe(PRODUCT_SELECT_COLUMNS);
    expect(interestSelect).toBe(PRODUCT_SELECT_COLUMNS);
  });

  // The test above compares STRING VALUES: `.toBe()` on primitive strings is
  // value equality, not reference equality, so it cannot tell "these two call
  // sites share one declaration" apart from "these two call sites happen to
  // hold byte-identical literals today" — proved by hand while writing this
  // (re-forking PRODUCT_SELECT_COLUMNS into a second, currently-identical
  // inline literal at one call site left the test above GREEN). A re-fork is
  // exactly the SHOP-DROP-002 precondition: the moment the fork exists, the
  // two copies can be edited independently and drift, even before either one
  // actually differs. So this checks the SOURCE, not the runtime value: both
  // products reads must call `.select(PRODUCT_SELECT_COLUMNS)` — the
  // identifier — and no second string literal shaped like a products column
  // list may exist anywhere in the file.
  const SOURCE_PATH = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../addon-products.ts",
  );
  // Comment lines stripped so a doc comment merely MENTIONING the call shape
  // (as the header comment above does, in backticks) cannot inflate the
  // count — only actual code is inspected.
  const codeOnly = readFileSync(SOURCE_PATH, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  it("both products reads call .select(PRODUCT_SELECT_COLUMNS) — the identifier, exactly twice", () => {
    const identifierCalls =
      codeOnly.match(/\.select\(PRODUCT_SELECT_COLUMNS\)/g) ?? [];
    expect(identifierCalls).toHaveLength(2);
  });

  it("no second hardcoded products column-select literal exists to fork from the shared constant", () => {
    // Any `.select("...")` call whose string literal mentions a column only
    // the products list has (price_amount, is_checkout_addon) would be a
    // re-forked copy — the exact mutation that broke this GREEN above.
    const literalProductSelects =
      codeOnly.match(/\.select\(\s*"[^"]*price_amount[^"]*"\s*\)/g) ?? [];
    expect(literalProductSelects).toHaveLength(0);
  });
});

// Behaviour change from sharing mapProductRow, called out explicitly per the
// review brief rather than silently absorbed: getInterestEligibleProducts's
// output previously omitted customMade/availableFrom/preorder entirely (the
// object literal never set those keys). It now includes them, because both
// functions run the SAME mapper. This is INERT for the current caller —
// booking-interests.ts's computeInterestRows reads none of these three
// fields (verified by reading it; it only reads id/variants/price/quantity)
// — but a future caller of getInterestEligibleProducts now gets them for
// free instead of needing its own one-off column addition.
describe("getInterestEligibleProducts: now carries customMade/availableFrom/preorder (behaviour change, documented)", () => {
  it("surfaces all three fields on its output for the first time", async () => {
    mockServiceClient.from.mockImplementation(
      fakeClient({
        profiles: { data: { settings: {} } },
        products: {
          data: [
            {
              id: "p1",
              title: "Portrait commission",
              image_url: null,
              price_amount: 40,
              currency: "eur",
              status: "active",
              is_checkout_addon: true,
              quantity: null,
              custom_made: true,
              // Well in the past, so gate 1 (productAvailability) keeps it.
              available_from: "2020-01-01T00:00:00.000Z",
              preorder: false,
              product_variants: [],
            },
          ],
        },
      }),
    );

    const rows = await getInterestEligibleProducts("artist_1");
    expect(rows).toHaveLength(1);
    expect(rows[0].customMade).toBe(true);
    expect(rows[0].availableFrom).toBe("2020-01-01T00:00:00.000Z");
    expect(rows[0].preorder).toBe(false);
  });
});
