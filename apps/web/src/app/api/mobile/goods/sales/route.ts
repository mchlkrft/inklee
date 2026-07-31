import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { canSeeAdvancedAnalytics } from "@/lib/server/entitlement-gates";
import { toPriceNumber } from "@/lib/goods";
import {
  computeSalesAnalytics,
  type SalesRow,
} from "@/lib/goods-sales-analytics";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data: orderData, error } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, fulfillment_status, booking_id, order_items(type, title_snapshot, variant_snapshot, quantity, total_amount)",
    )
    .eq("artist_id", userId)
    .in("status", ["paid", "refunded", "partially_refunded"])
    .order("created_at", { ascending: false });

  if (error) return mobileError(500, error.message);

  type OI = {
    type: string;
    title_snapshot: string;
    variant_snapshot: string | null;
    quantity: number;
    total_amount: string | number;
  };
  type O = {
    id: string;
    created_at: string;
    status: string;
    fulfillment_status: string;
    booking_id: string;
    order_items: OI[] | null;
  };

  const orders = (orderData ?? []) as unknown as O[];
  const salesRows: SalesRow[] = [];
  let totalRevenue = 0;
  let totalItems = 0;

  for (const o of orders) {
    const items = (o.order_items ?? []).filter((i) => i.type === "product");
    for (const i of items) {
      const amount = toPriceNumber(i.total_amount);
      const qty = Number(i.quantity);
      const refunded = o.status !== "paid";
      salesRows.push({
        date: o.created_at,
        item: `${i.title_snapshot}${i.variant_snapshot ? ` · ${i.variant_snapshot}` : ""}`,
        qty,
        amount,
        refunded,
        orderId: o.id,
      });
      if (!refunded) {
        totalRevenue += amount;
        totalItems += qty;
      }
    }
  }

  const overrides = await getAccountOverrides(userId);
  const showAdvanced = canSeeAdvancedAnalytics(overrides);
  const analytics =
    showAdvanced && salesRows.length > 0
      ? computeSalesAnalytics(salesRows)
      : null;

  return mobileOk({
    totalRevenue,
    totalItems,
    orderCount: orders.length,
    analytics,
  });
}
