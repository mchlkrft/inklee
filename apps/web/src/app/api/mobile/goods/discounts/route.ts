import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsDiscountsAllowed } from "@/lib/server/entitlement-gates";
import {
  saveDiscountCore,
  setDiscountActiveCore,
} from "@/lib/server/discount-write";
import type { MobileDiscountList } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET / POST / PATCH /api/mobile/goods/discounts — the native twin of
// /goods/discounts. Every write goes through the SAME cores the web action
// uses, so the entitlement refusal, the duplicate-code handling and the unit
// conversion cannot drift between surfaces.

export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const [{ data: codes, error }, { data: redemptions }] = await Promise.all([
    supabase
      .from("discount_codes")
      .select(
        "id, code, kind, value, min_subtotal_minor, max_redemptions, starts_at, ends_at, active",
      )
      .eq("artist_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("discount_redemptions")
      .select("discount_code_id")
      .eq("artist_id", userId),
  ]);
  if (error) return mobileError(500, error.message);

  // Usage counted from the redemption ROWS, which are what actually enforce
  // the cap. A counter on the code would be a second source that could drift
  // from the rows deciding whether the code still works.
  const usage = new Map<string, number>();
  for (const r of redemptions ?? []) {
    const key = r.discount_code_id as string;
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }

  let entitled = false;
  try {
    entitled = goodsDiscountsAllowed(await getAccountOverrides(userId));
  } catch {
    entitled = false;
  }

  const body: MobileDiscountList = {
    entitled,
    codes: (codes ?? []).map((c) => ({
      id: c.id as string,
      code: c.code as string,
      kind: c.kind === "fixed" ? "fixed" : "percent",
      value: c.value as number,
      minSubtotalMinor: c.min_subtotal_minor as number,
      maxRedemptions: (c.max_redemptions as number | null) ?? null,
      startsAt: (c.starts_at as string | null) ?? null,
      endsAt: (c.ends_at as string | null) ?? null,
      active: c.active as boolean,
      used: usage.get(c.id as string) ?? 0,
    })),
  };
  return mobileOk(body);
}

export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const result = await saveDiscountCore(
    supabase,
    userId,
    {
      code: b.code,
      kind: b.kind,
      value: b.value,
      minSubtotal: b.minSubtotal,
      maxRedemptions: b.maxRedemptions,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      active: b.active,
    },
    typeof b.id === "string" ? b.id : undefined,
  );
  if (!result.ok) {
    // 403 for the entitlement so the app maps it to IAP-safe copy via
    // plan-errors.ts; 400 for anything the artist can correct.
    return mobileError(
      result.code === "not_entitled"
        ? 403
        : result.code === "failed"
          ? 500
          : 400,
      result.error,
      result.code,
    );
  }
  return mobileOk({ ok: true, id: result.id });
}

export async function PATCH(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.id !== "string" || typeof b.active !== "boolean") {
    return mobileError(400, "Nothing to update.");
  }

  const result = await setDiscountActiveCore(supabase, userId, b.id, b.active);
  if (!result.ok) return mobileError(500, result.error, result.code);
  return mobileOk({ ok: true });
}
