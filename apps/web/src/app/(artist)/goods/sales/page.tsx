import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, toPriceNumber } from "@/lib/goods";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { canSeeAdvancedAnalytics } from "@/lib/server/entitlement-gates";
import {
  computeSalesAnalytics,
  type SalesRow,
} from "@/lib/goods-sales-analytics";

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

function fmtMonth(key: string) {
  const [y, m] = key.split("-");
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(Number(y), Number(m) - 1));
}

type RawOrderItem = {
  type: string;
  title_snapshot: string;
  variant_snapshot: string | null;
  quantity: number;
  total_amount: string | number;
};

type RawOrder = {
  id: string;
  created_at: string;
  status: string;
  fulfillment_status: string;
  booking_id: string;
  order_items: RawOrderItem[] | null;
};

type Row = {
  key: string;
  orderId: string;
  date: string;
  client: string;
  bookingId: string;
  item: string;
  qty: number;
  amount: number;
  fulfillment: string;
  refunded: boolean;
};

function buildRows(
  orders: RawOrder[],
  clientByBooking: Map<string, string>,
): Row[] {
  const rows: Row[] = [];
  for (const o of orders) {
    const client = clientByBooking.get(o.booking_id) ?? "—";
    const items = (o.order_items ?? []).filter((i) => i.type === "product");
    items.forEach((i, idx) => {
      rows.push({
        key: `${o.id}-${idx}`,
        orderId: o.id,
        date: o.created_at,
        client,
        bookingId: o.booking_id,
        item: `${i.title_snapshot}${i.variant_snapshot ? ` · ${i.variant_snapshot}` : ""}`,
        qty: Number(i.quantity),
        amount: toPriceNumber(i.total_amount),
        fulfillment: o.fulfillment_status,
        refunded: o.status !== "paid",
      });
    });
  }
  return rows;
}

function toSalesRows(rows: Row[]): SalesRow[] {
  return rows.map((r) => ({
    date: r.date,
    item: r.item,
    qty: r.qty,
    amount: r.amount,
    refunded: r.refunded,
    orderId: r.key.split("-")[0],
  }));
}

export default async function GoodsSalesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const overrides = await getAccountOverrides(user!.id);
  const showAdvanced = canSeeAdvancedAnalytics(overrides);

  const { data: orderData } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, fulfillment_status, booking_id, order_items(type, title_snapshot, variant_snapshot, quantity, total_amount)",
    )
    .eq("artist_id", user!.id)
    .in("status", ["paid", "refunded", "partially_refunded"])
    .order("created_at", { ascending: false });

  const orders = (orderData ?? []) as unknown as RawOrder[];

  const bookingIds = [
    ...new Set(orders.map((o) => o.booking_id).filter(Boolean)),
  ];
  const clientByBooking = new Map<string, string>();
  if (bookingIds.length > 0) {
    const { data: brs } = await supabase
      .from("booking_requests")
      .select("id, customer_handle, customer_email")
      .in("id", bookingIds);
    for (const b of (brs ?? []) as {
      id: string;
      customer_handle: string | null;
      customer_email: string | null;
    }[]) {
      clientByBooking.set(
        b.id,
        b.customer_handle ? `@${b.customer_handle}` : (b.customer_email ?? "—"),
      );
    }
  }

  const rows = buildRows(orders, clientByBooking);

  const totalRevenue = rows.reduce(
    (s, r) => s + (r.refunded ? 0 : r.amount),
    0,
  );
  const totalItems = rows.reduce((s, r) => s + (r.refunded ? 0 : r.qty), 0);

  const analytics =
    showAdvanced && rows.length > 0
      ? computeSalesAnalytics(toSalesRows(rows))
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Sales
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Goods your clients have paid for, newest first. A simple record for
          your bookkeeping.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No goods sold yet. Sales show up here once a client pays for goods
            with their deposit.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-8 rounded-[16px] border border-border px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Items sold
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {totalItems}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Goods revenue
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {formatPrice(totalRevenue)}
              </p>
            </div>
          </div>

          {analytics && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Trends</h2>

              <div className="flex flex-wrap gap-4">
                <StatCard
                  label="Revenue this month"
                  value={formatPrice(analytics.thisMonth.revenue)}
                  change={analytics.revenueChange}
                />
                <StatCard
                  label="Orders this month"
                  value={String(analytics.thisMonth.orders)}
                  change={analytics.ordersChange}
                />
              </div>

              {analytics.topProducts.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                    Top products
                  </h3>
                  <div className="overflow-x-auto rounded-[16px] border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2.5 font-medium">Product</th>
                          <th className="px-4 py-2.5 text-center font-medium">
                            Sold
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium">
                            Revenue
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {analytics.topProducts.map((p) => (
                          <tr key={p.name}>
                            <td className="px-4 py-2.5 text-foreground">
                              {p.name}
                            </td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-foreground">
                              {p.qty}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-foreground">
                              {formatPrice(p.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {analytics.months.length > 1 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                    Monthly summary
                  </h3>
                  <div className="overflow-x-auto rounded-[16px] border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2.5 font-medium">Month</th>
                          <th className="px-4 py-2.5 text-center font-medium">
                            Orders
                          </th>
                          <th className="px-4 py-2.5 text-center font-medium">
                            Items
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium">
                            Revenue
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {analytics.months.map((m) => (
                          <tr key={m.key}>
                            <td className="whitespace-nowrap px-4 py-2.5 text-foreground">
                              {fmtMonth(m.key)}
                            </td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-foreground">
                              {m.orders}
                            </td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-foreground">
                              {m.items}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-foreground">
                              {formatPrice(m.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-[16px] border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 text-center font-medium">Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Pickup</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.key} className={r.refunded ? "opacity-60" : ""}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {fmtDate(r.date)}
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.client}</td>
                    <td className="px-4 py-3 text-foreground">{r.item}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-foreground">
                      {r.qty}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-foreground">
                      {formatPrice(r.amount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {r.refunded
                        ? "Refunded"
                        : r.fulfillment === "picked_up"
                          ? "Picked up"
                          : r.fulfillment === "cancelled"
                            ? "Cancelled"
                            : "Awaiting pickup"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={`/goods/sales/${r.orderId}`}
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: string | null;
}) {
  const isPositive = change?.startsWith("+");
  return (
    <div className="min-w-[160px] rounded-[16px] border border-border px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {change && (
        <p
          className={`mt-0.5 text-xs font-medium ${isPositive ? "text-green-600" : "text-red-500"}`}
        >
          {change} vs last month
        </p>
      )}
    </div>
  );
}
