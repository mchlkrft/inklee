import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeDiscountCode,
  validateDiscountCode,
  DISCOUNT_KINDS,
  type DiscountKind,
} from "@inklee/shared/discounts";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsDiscountsAllowed } from "./entitlement-gates";

// The ONE write path for discount codes (Plus build P5b), shared by the web
// action and the mobile route, same discipline as saveAppearanceCore: the
// entitlement is refused server-side rather than hidden in the UI.

export type DiscountInput = {
  code?: unknown;
  kind?: unknown;
  /** Percent as a number (10 = 10%), fixed as major units (5 = 5.00). The
   *  storage unit (bps / minor) is derived here so no caller has to know it. */
  value?: unknown;
  minSubtotal?: unknown;
  maxRedemptions?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  active?: unknown;
};

export type DiscountWriteResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      code: "not_entitled" | "invalid" | "duplicate" | "failed";
    };

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function saveDiscountCore(
  supabase: SupabaseClient,
  artistId: string,
  input: DiscountInput,
  existingId?: string,
): Promise<DiscountWriteResult> {
  try {
    if (!goodsDiscountsAllowed(await getAccountOverrides(artistId))) {
      return {
        ok: false,
        code: "not_entitled",
        error: "Discount codes aren't included in your current plan.",
      };
    }
  } catch {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't verify your plan. Please try again.",
    };
  }

  const code = normalizeDiscountCode(input.code);
  const codeError = validateDiscountCode(code);
  if (codeError) return { ok: false, code: "invalid", error: codeError };

  const kind = (DISCOUNT_KINDS as readonly string[]).includes(
    String(input.kind),
  )
    ? (input.kind as DiscountKind)
    : null;
  if (!kind) {
    return { ok: false, code: "invalid", error: "Choose a discount type." };
  }

  const rawValue = num(input.value);
  if (rawValue === null || rawValue <= 0) {
    return { ok: false, code: "invalid", error: "Enter an amount above zero." };
  }
  // Percent arrives as a human number and is stored in basis points; fixed
  // arrives in major units and is stored in minor. Both happen to be a factor
  // of 100, which is why this is one line rather than a branch that would look
  // like it does two different things.
  const value = Math.round(rawValue * 100);
  if (kind === "percent" && value > 10000) {
    return {
      ok: false,
      code: "invalid",
      error: "A percentage discount can't be more than 100%.",
    };
  }

  const minSubtotal = Math.max(
    0,
    Math.round((num(input.minSubtotal) ?? 0) * 100),
  );
  const maxRedemptionsRaw = num(input.maxRedemptions);
  const maxRedemptions =
    maxRedemptionsRaw === null || maxRedemptionsRaw <= 0
      ? null
      : Math.round(maxRedemptionsRaw);

  const startsAt = isoOrNull(input.startsAt);
  const endsAt = isoOrNull(input.endsAt);
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return {
      ok: false,
      code: "invalid",
      error: "The end date has to be after the start date.",
    };
  }

  const row = {
    artist_id: artistId,
    code,
    kind,
    value,
    currency: "eur",
    min_subtotal_minor: minSubtotal,
    max_redemptions: maxRedemptions,
    starts_at: startsAt,
    ends_at: endsAt,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  };

  const query = existingId
    ? supabase
        .from("discount_codes")
        .update(row)
        .eq("id", existingId)
        .eq("artist_id", artistId)
        .select("id")
        .maybeSingle()
    : supabase.from("discount_codes").insert(row).select("id").single();

  const { data, error } = await query;
  if (error) {
    // The unique index is the arbiter, not a pre-check: two tabs saving the
    // same code at once both pass a read and only one can pass this.
    if (error.code === "23505") {
      return {
        ok: false,
        code: "duplicate",
        error: "You already have a code with that name.",
      };
    }
    return { ok: false, code: "failed", error: "Couldn't save. Try again." };
  }
  if (!data) {
    return { ok: false, code: "failed", error: "That code no longer exists." };
  }
  return { ok: true, id: data.id as string };
}

/** Switch a code off (or back on). Deliberately not a delete: a code an artist
 *  published is a promise, and its redemption history is what a sales report
 *  is made of. */
export async function setDiscountActiveCore(
  supabase: SupabaseClient,
  artistId: string,
  id: string,
  active: boolean,
): Promise<DiscountWriteResult> {
  const { data, error } = await supabase
    .from("discount_codes")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("artist_id", artistId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: "failed", error: "Couldn't save." };
  if (!data) {
    return { ok: false, code: "failed", error: "That code no longer exists." };
  }
  return { ok: true, id: data.id as string };
}
