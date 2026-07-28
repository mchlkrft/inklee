import { createClient } from "@/lib/supabase/server";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsDiscountsAllowed } from "@/lib/server/entitlement-gates";
import DiscountList, { type DiscountRow } from "./discount-list";

export const metadata = { title: "Discount codes" };

export default async function DiscountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Read through RLS: the policy on discount_codes scopes to the owner, so
  // the query IS the authorization.
  const { data: codes } = await supabase
    .from("discount_codes")
    .select(
      "id, code, kind, value, min_subtotal_minor, max_redemptions, starts_at, ends_at, active",
    )
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });

  // Usage comes from the redemptions table, which is what actually enforces
  // the cap. A counter on the code would be a second source that could drift
  // from the rows that decide whether the code still works.
  const { data: redemptions } = await supabase
    .from("discount_redemptions")
    .select("discount_code_id")
    .eq("artist_id", user!.id);
  const usage = new Map<string, number>();
  for (const r of redemptions ?? []) {
    const key = r.discount_code_id as string;
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }

  let entitled = false;
  try {
    entitled = goodsDiscountsAllowed(await getAccountOverrides(user!.id));
  } catch {
    entitled = false;
  }

  const rows: DiscountRow[] = (codes ?? []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    kind: c.kind === "fixed" ? "fixed" : "percent",
    value: c.value as number,
    min_subtotal_minor: c.min_subtotal_minor as number,
    max_redemptions: (c.max_redemptions as number | null) ?? null,
    starts_at: (c.starts_at as string | null) ?? null,
    ends_at: (c.ends_at as string | null) ?? null,
    active: c.active as boolean,
    used: usage.get(c.id as string) ?? 0,
  }));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Discount codes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Codes apply to the goods in an order. They never come off a deposit.
        </p>
      </div>
      <DiscountList codes={rows} entitled={entitled} />
    </div>
  );
}
