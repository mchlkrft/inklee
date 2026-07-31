import { describe, it, expect } from "vitest";
import {
  pctChange,
  computeSalesAnalytics,
  type SalesRow,
} from "../goods-sales-analytics";

describe("pctChange", () => {
  it("returns null when both values are zero", () => {
    expect(pctChange(0, 0)).toBeNull();
  });

  it("returns +100% when previous is zero and current is positive", () => {
    expect(pctChange(500, 0)).toBe("+100%");
  });

  it("computes a positive change", () => {
    expect(pctChange(150, 100)).toBe("+50%");
  });

  it("computes a negative change", () => {
    expect(pctChange(50, 100)).toBe("-50%");
  });

  it("returns +0% for no change", () => {
    expect(pctChange(100, 100)).toBe("+0%");
  });
});

function row(overrides: Partial<SalesRow> = {}): SalesRow {
  return {
    date: "2026-07-15T10:00:00Z",
    item: "Aftercare Balm",
    qty: 1,
    amount: 12.0,
    refunded: false,
    orderId: "order_1",
    ...overrides,
  };
}

describe("computeSalesAnalytics", () => {
  const july2026 = new Date(2026, 6, 15);

  it("returns empty analytics for no rows", () => {
    const result = computeSalesAnalytics([], july2026);
    expect(result.topProducts).toEqual([]);
    expect(result.months).toEqual([]);
    expect(result.thisMonth.revenue).toBe(0);
    expect(result.prevMonth.revenue).toBe(0);
    expect(result.revenueChange).toBeNull();
  });

  it("excludes refunded rows from product totals", () => {
    const rows: SalesRow[] = [
      row({ amount: 20, refunded: false }),
      row({ amount: 15, refunded: true, orderId: "order_2" }),
    ];
    const result = computeSalesAnalytics(rows, july2026);
    expect(result.topProducts).toHaveLength(1);
    expect(result.topProducts[0].revenue).toBe(20);
  });

  it("aggregates per-product revenue and quantity", () => {
    const rows: SalesRow[] = [
      row({ item: "Balm", qty: 2, amount: 24, orderId: "o1" }),
      row({ item: "Balm", qty: 1, amount: 12, orderId: "o2" }),
      row({ item: "Stencil", qty: 1, amount: 8, orderId: "o3" }),
    ];
    const result = computeSalesAnalytics(rows, july2026);
    expect(result.topProducts).toHaveLength(2);
    const balm = result.topProducts.find((p) => p.name === "Balm")!;
    expect(balm.qty).toBe(3);
    expect(balm.revenue).toBe(36);
    expect(balm.orders).toBe(2);
  });

  it("sorts products by revenue descending", () => {
    const rows: SalesRow[] = [
      row({ item: "Cheap", amount: 5, orderId: "o1" }),
      row({ item: "Expensive", amount: 50, orderId: "o2" }),
      row({ item: "Medium", amount: 20, orderId: "o3" }),
    ];
    const result = computeSalesAnalytics(rows, july2026);
    expect(result.topProducts.map((p) => p.name)).toEqual([
      "Expensive",
      "Medium",
      "Cheap",
    ]);
  });

  it("limits top products to 8", () => {
    const rows: SalesRow[] = Array.from({ length: 12 }, (_, i) =>
      row({ item: `Product ${i}`, amount: 10, orderId: `o${i}` }),
    );
    const result = computeSalesAnalytics(rows, july2026);
    expect(result.topProducts).toHaveLength(8);
  });

  it("groups by month and computes month-over-month changes", () => {
    const rows: SalesRow[] = [
      row({ date: "2026-07-10T00:00:00Z", amount: 30, orderId: "o1" }),
      row({ date: "2026-07-20T00:00:00Z", amount: 20, orderId: "o2" }),
      row({ date: "2026-06-05T00:00:00Z", amount: 25, orderId: "o3" }),
    ];
    const result = computeSalesAnalytics(rows, july2026);

    expect(result.thisMonth.revenue).toBe(50);
    expect(result.thisMonth.orders).toBe(2);
    expect(result.prevMonth.revenue).toBe(25);
    expect(result.prevMonth.orders).toBe(1);
    expect(result.revenueChange).toBe("+100%");
    expect(result.ordersChange).toBe("+100%");
  });

  it("sorts months newest-first and limits to 6", () => {
    const rows: SalesRow[] = Array.from({ length: 8 }, (_, i) =>
      row({
        date: `2026-0${i + 1}-15T00:00:00Z`,
        orderId: `o${i}`,
      }),
    );
    const result = computeSalesAnalytics(rows, july2026);
    expect(result.months).toHaveLength(6);
    expect(result.months[0].key).toBe("2026-08");
    expect(result.months[5].key).toBe("2026-03");
  });

  it("counts distinct orders per month", () => {
    const rows: SalesRow[] = [
      row({ date: "2026-07-10T00:00:00Z", item: "A", orderId: "o1" }),
      row({ date: "2026-07-10T00:00:00Z", item: "B", orderId: "o1" }),
      row({ date: "2026-07-20T00:00:00Z", item: "A", orderId: "o2" }),
    ];
    const result = computeSalesAnalytics(rows, july2026);
    expect(result.thisMonth.orders).toBe(2);
    expect(result.thisMonth.items).toBe(3);
  });
});
