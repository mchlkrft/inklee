import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REFUNDABLE_ORDER_STATUSES } from "@/lib/server/goods-order-refund";
import { GoodsRefundControl } from "./goods-refund-control";

export const metadata = { title: "Order" };

const REFUNDABLE = new Set<string>(REFUNDABLE_ORDER_STATUSES);

function formatAmount(major: number | string, currency: string): string {
  return `${Number(major).toFixed(2)} ${currency.toUpperCase()}`;
}

function statusLabel(status: string): string {
  const t = status.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

type OrderItemRow = {
  id: string;
  type: string;
  title_snapshot: string;
  variant_snapshot: string | null;
  quantity: number;
  unit_amount: number | string;
  total_amount: number | string;
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, status, currency, client_email, booking_id, created_at, order_items(id, type, title_snapshot, variant_snapshot, quantity, unit_amount, total_amount)",
    )
    .eq("artist_id", user.id)
    .eq("id", id)
    .maybeSingle();
  if (error || !order) notFound();

  const items = ((order.order_items ?? []) as OrderItemRow[]).filter(
    (i) => i.type === "product" || i.type === "bundle",
  );
  const currency = (order.currency as string) ?? "eur";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <Link
        href="/goods/sales"
        className="text-sm text-muted-foreground underline"
      >
        Back to sales
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Order</h1>
        <p className="text-sm text-muted-foreground">
          {statusLabel(order.status as string)}
          {order.client_email ? ` · ${order.client_email}` : ""}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Line items</h2>
        <ul className="divide-y divide-border rounded-[14px] border border-border">
          {items.map((line) => (
            <li
              key={line.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {line.title_snapshot}
                  {line.variant_snapshot ? ` · ${line.variant_snapshot}` : ""}
                  {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm text-foreground">
                {formatAmount(line.total_amount, currency)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {REFUNDABLE.has(order.status as string) && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">Refund</h2>
          <GoodsRefundControl
            orderId={order.id}
            lines={items.map((i) => ({
              id: i.id,
              name: i.variant_snapshot
                ? `${i.title_snapshot} · ${i.variant_snapshot}`
                : i.title_snapshot,
              quantity: i.quantity,
              totalMinor: Math.round(Number(i.total_amount) * 100),
            }))}
            currency={currency}
          />
        </section>
      )}
    </div>
  );
}
