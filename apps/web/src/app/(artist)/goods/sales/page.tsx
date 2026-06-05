import { createClient } from "@/lib/supabase/server";
import { formatPrice, toPriceNumber } from "@/lib/goods";

// Sales ledger — every goods line item a client has paid for, newest first.
// A lightweight bookkeeping record (not an order-management system). Deposits
// are excluded (this is a goods view); only paid/refunded orders appear.

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(iso),
  );
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

export default async function GoodsSalesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orderData } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, fulfillment_status, booking_id, order_items(type, title_snapshot, variant_snapshot, quantity, total_amount)",
    )
    .eq("artist_id", user!.id)
    .in("status", ["paid", "refunded", "partially_refunded"])
    .order("created_at", { ascending: false });

  const orders = (orderData ?? []) as unknown as RawOrder[];

  // Resolve client names in one extra query (avoids a PostgREST parent embed).
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

  type Row = {
    key: string;
    date: string;
    client: string;
    bookingId: string;
    item: string;
    qty: number;
    amount: number;
    fulfillment: string;
    refunded: boolean;
  };
  const rows: Row[] = [];
  for (const o of orders) {
    const client = clientByBooking.get(o.booking_id) ?? "—";
    const items = (o.order_items ?? []).filter((i) => i.type === "product");
    items.forEach((i, idx) => {
      rows.push({
        key: `${o.id}-${idx}`,
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

  const totalRevenue = rows.reduce(
    (s, r) => s + (r.refunded ? 0 : r.amount),
    0,
  );
  const totalItems = rows.reduce((s, r) => s + (r.refunded ? 0 : r.qty), 0);

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
