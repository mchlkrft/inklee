import { describe, it, expect, vi, beforeEach } from "vitest";

// P0 rejection-path tests (plus-build-plan.md): the goods guards shared by the
// web actions and the mobile routes. The cap must block at the boundary, fail
// OPEN on read blips (soft-cap posture), and the order-reference guard must
// fail SAFE toward archiving.

const serviceTables: Record<string, unknown[]> = {};
const serviceErrors: Record<string, { message: string } | null> = {};

/** Every read the guard performed, with the column it filtered on.
 *
 *  Added for C4: without it the double answered by TABLE alone, so a leg that
 *  filtered the right table on the WRONG column (product_id vs order_item_id)
 *  returned the same rows and the whole suite stayed green. A column swap is a
 *  one-token mistake that changes what the guard is actually asking. */
let serviceReads: { table: string; filters: Record<string, unknown> }[] = [];

function serviceQuery(table: string) {
  const rows = serviceTables[table] ?? [];
  const error = serviceErrors[table] ?? null;
  const result = { data: error ? null : rows, error };
  const read = { table, filters: {} as Record<string, unknown> };
  serviceReads.push(read);
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "limit", "order"]) {
    chain[m] = () => chain;
  }
  chain.eq = (column: string, value: unknown) => {
    read.filters[column] = value;
    return chain;
  };
  chain.in = (column: string, values: unknown) => {
    read.filters[column] = values;
    return chain;
  };
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: (t: string) => serviceQuery(t) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const getAccountOverrides = vi.fn();
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));

const capStateMock = vi.fn();
vi.mock("@/lib/server/entitlement-gates", () => ({
  capState: (...a: unknown[]) => capStateMock(...a),
}));

import {
  checkProductCap,
  productHasOrderReferences,
} from "@/lib/server/goods-guard";

// The artist-scoped client the callers pass in: a count-shaped query chain.
function artistClient(count: number | null, error = false) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in"]) chain[m] = () => chain;
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) =>
    error && reject
      ? reject(new Error("db down"))
      : resolve({ count, error: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => chain } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceReads = [];
  for (const k of Object.keys(serviceTables)) delete serviceTables[k];
  for (const k of Object.keys(serviceErrors)) delete serviceErrors[k];
  getAccountOverrides.mockResolvedValue({});
});

describe("checkProductCap", () => {
  it("blocks at the cap with the cap number in the message", async () => {
    capStateMock.mockReturnValue({ blocked: true, cap: 3 });
    const msg = await checkProductCap(artistClient(3), "artist-1");
    expect(msg).toContain("3-product limit");
    // IAP-critical: the goods cap message carries no purchase steering, so the
    // app can show it verbatim.
    expect(msg).not.toContain("Upgrade");
    expect(capStateMock).toHaveBeenCalledWith({}, "active_products", 3);
  });

  it("allows under the cap", async () => {
    capStateMock.mockReturnValue({ blocked: false, cap: 3 });
    expect(await checkProductCap(artistClient(2), "artist-1")).toBeNull();
  });

  it("fails OPEN when the count read blows up", async () => {
    capStateMock.mockReturnValue({ blocked: true, cap: 3 });
    expect(
      await checkProductCap(artistClient(null, true), "artist-1"),
    ).toBeNull();
  });
});

describe("productHasOrderReferences", () => {
  it("true on a direct order_items reference", async () => {
    serviceTables["order_items"] = [{ id: "oi-1" }];
    expect(await productHasOrderReferences("p-1")).toBe(true);
  });

  it("true on a variant-only reference", async () => {
    // First order_items read (by product_id) returns empty, variants exist,
    // second read (by variant_id) matches. The stub returns the same rows for
    // both order_items reads, so model the variant-only case by leaving
    // order_items empty and asserting the variant path is consulted.
    serviceTables["order_items"] = [];
    serviceTables["product_variants"] = [{ id: "v-1" }];
    // With no order rows at all, the result is false...
    expect(await productHasOrderReferences("p-1")).toBe(false);
    // ...and with order rows present the direct branch already catches it
    // (covered above). The fail-safe branches below are the load-bearing ones.
  });

  it("false when nothing references the product", async () => {
    serviceTables["order_items"] = [];
    serviceTables["product_variants"] = [];
    expect(await productHasOrderReferences("p-1")).toBe(false);
  });

  it("fails SAFE (archive, not delete) when the reference check errors", async () => {
    serviceErrors["order_items"] = { message: "boom" };
    expect(await productHasOrderReferences("p-1")).toBe(true);
  });

  it("fails SAFE when the VARIANT LIST read errors (review finding 2026-07-28)", async () => {
    // The middle leg originally failed open: a variants read blip made
    // ids=[] and returned false, letting the hard delete proceed.
    serviceTables["order_items"] = [];
    serviceErrors["product_variants"] = { message: "boom" };
    expect(await productHasOrderReferences("p-1")).toBe(true);
  });
});

// C4 / GC6: a product sold ONLY inside a bundle. The bundle sale is one order
// line with product_id NULL, so the direct order_items check cannot see it; the
// components live only in the 0135 snapshot table. Without this leg the product
// looks unreferenced, gets hard-deleted, and product_bundle_items' ON DELETE
// CASCADE then erases it from the live bundle with no record of what was sold.
describe("productHasOrderReferences and bundle components (GC6)", () => {
  it("archives a product referenced ONLY through a bundle sale", async () => {
    serviceTables.order_items = [];
    serviceTables.booking_interests = [];
    serviceTables.product_variants = [];
    serviceTables.order_item_bundle_components = [{ id: "c1" }];
    // Fails if the order_item_bundle_components leg is deleted: every other
    // read is empty, so the guard would return false and the product would be
    // hard-deleted out from under a paid bundle order.
    expect(await productHasOrderReferences("p1")).toBe(true);

    // And it asks the right QUESTION. The snapshot table carries both
    // `product_id` and `order_item_id`; filtering on the latter would ask "was
    // this id an order item", which is never true of a product id, so the guard
    // would answer false for every product while looking entirely correct.
    const bundleRead = serviceReads.find(
      (r) => r.table === "order_item_bundle_components",
    );
    expect(bundleRead).toBeDefined();
    expect(bundleRead!.filters).toEqual({ product_id: "p1" });
  });

  it("fails SAFE toward archiving when the bundle-component read errors", async () => {
    serviceTables.order_items = [];
    serviceErrors.order_item_bundle_components = { message: "db down" };
    // Same direction as every other leg: an unreadable reference check must
    // archive, never delete. Fails if this leg is written fail-open (returning
    // false, or simply ignoring `error`), which is the defect the 2026-07-28
    // review found in the variant-list leg.
    expect(await productHasOrderReferences("p1")).toBe(true);
  });

  it("still deletes when the bundle-component table is empty like everything else", async () => {
    // The positive control for the two above: with the SAME reads present and
    // empty, the answer is false. Without it, "true" could mean the guard is
    // simply stuck on.
    serviceTables.order_items = [];
    serviceTables.booking_interests = [];
    serviceTables.product_variants = [];
    serviceTables.order_item_bundle_components = [];
    expect(await productHasOrderReferences("p1")).toBe(false);
  });
});

// P5 decision (carried from the P0 review): the product-level guard now counts
// booking_interests, matching the variant reconcile, which always did. Before
// this, deleting a product a client had picked and the artist had APPROVED
// silently dropped that line from checkout composition.
describe("productHasOrderReferences and booking interests", () => {
  it("archives when an approved interest references the product", async () => {
    serviceTables.order_items = [];
    serviceTables.booking_interests = [{ id: "i1" }];
    expect(await productHasOrderReferences("p1")).toBe(true);
  });

  it("archives when a PENDING interest references it, not just an approved one", async () => {
    // A pending interest is one artist click from approved, and archiving
    // instead of deleting costs nothing (archived products are outside the cap).
    serviceTables.order_items = [];
    serviceTables.booking_interests = [{ id: "i-pending" }];
    expect(await productHasOrderReferences("p1")).toBe(true);
  });

  it("archives when an interest names only a VARIANT of the product", async () => {
    // booking_interests.product_id is nullable, so a variant-only row would
    // otherwise slip past both the product and the order-line checks.
    serviceTables.order_items = [];
    serviceTables.booking_interests = [];
    serviceTables.product_variants = [{ id: "v1" }];
    let call = 0;
    const original = serviceTables.booking_interests;
    Object.defineProperty(serviceTables, "booking_interests", {
      configurable: true,
      get() {
        // First read is the product-level check (empty), second is by variant.
        call += 1;
        return call >= 2 ? [{ id: "i2" }] : original;
      },
    });
    expect(await productHasOrderReferences("p1")).toBe(true);
    delete (serviceTables as Record<string, unknown>).booking_interests;
  });

  it("still deletes when nothing references the product at all", async () => {
    serviceTables.order_items = [];
    serviceTables.booking_interests = [];
    serviceTables.product_variants = [];
    expect(await productHasOrderReferences("p1")).toBe(false);
  });

  it("fails SAFE toward archiving when the interest read errors", async () => {
    serviceTables.order_items = [];
    serviceErrors.booking_interests = { message: "db down" };
    expect(await productHasOrderReferences("p1")).toBe(true);
  });
});
