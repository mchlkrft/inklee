export type SalesRow = {
  date: string;
  item: string;
  qty: number;
  amount: number;
  refunded: boolean;
  orderId: string;
};

export type ProductSummary = {
  name: string;
  qty: number;
  revenue: number;
  orders: number;
};

export type MonthSummary = {
  key: string;
  orders: number;
  items: number;
  revenue: number;
};

export type SalesAnalytics = {
  topProducts: ProductSummary[];
  months: MonthSummary[];
  thisMonth: { orders: number; items: number; revenue: number };
  prevMonth: { orders: number; items: number; revenue: number };
  revenueChange: string | null;
  ordersChange: string | null;
};

export function pctChange(current: number, previous: number): string | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return "+100%";
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export function computeSalesAnalytics(
  rows: SalesRow[],
  now: Date = new Date(),
): SalesAnalytics {
  const paidRows = rows.filter((r) => !r.refunded);

  const productMap = new Map<string, ProductSummary>();
  const monthMap = new Map<string, MonthSummary>();
  const ordersByMonth = new Map<string, Set<string>>();

  for (const r of paidRows) {
    const existing = productMap.get(r.item);
    if (existing) {
      existing.qty += r.qty;
      existing.revenue += r.amount;
      existing.orders++;
    } else {
      productMap.set(r.item, {
        name: r.item,
        qty: r.qty,
        revenue: r.amount,
        orders: 1,
      });
    }

    const monthKey = r.date.slice(0, 7);
    const ms = monthMap.get(monthKey);
    if (ms) {
      ms.items += r.qty;
      ms.revenue += r.amount;
    } else {
      monthMap.set(monthKey, {
        key: monthKey,
        orders: 0,
        items: r.qty,
        revenue: r.amount,
      });
    }
    if (!ordersByMonth.has(monthKey)) ordersByMonth.set(monthKey, new Set());
    ordersByMonth.get(monthKey)!.add(r.orderId);
  }

  for (const [mk, s] of ordersByMonth) {
    const ms = monthMap.get(mk);
    if (ms) ms.orders = s.size;
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const months = [...monthMap.values()].sort((a, b) =>
    b.key.localeCompare(a.key),
  );

  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

  const thisMonth = monthMap.get(thisMonthKey) ?? {
    orders: 0,
    items: 0,
    revenue: 0,
  };
  const prevMonth = monthMap.get(lastMonthKey) ?? {
    orders: 0,
    items: 0,
    revenue: 0,
  };

  return {
    topProducts,
    months: months.slice(0, 6),
    thisMonth,
    prevMonth,
    revenueChange: pctChange(thisMonth.revenue, prevMonth.revenue),
    ordersChange: pctChange(thisMonth.orders, prevMonth.orders),
  };
}
