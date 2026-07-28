import "server-only";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { conditionalQuestionsAllowed } from "./entitlement-gates";

// The entitlement boundary for booking-form BEHAVIOUR (Plus build P3).
// The visual boundary lives in lib/server/appearance.ts; this is the other
// half, and it is deliberately a separate module so a page never has to know
// which capability key governs which half.

/**
 * Apply the conditional-questions entitlement to a field list.
 *
 * An un-entitled artist's conditions are STRIPPED for rendering and
 * validation, so every question shows. That is the downgrade behaviour the
 * capability registry specifies, and it is the only safe direction: honouring
 * a condition for an artist who is not entitled would keep questions hidden
 * from their clients, which nobody would notice until a booking arrived
 * missing information.
 *
 * Stripping happens on the READ, never in the database: the artist's stored
 * conditions survive a downgrade untouched and resume working on re-upgrade.
 *
 * FAIL-SAFE: a plan-read blip strips conditions rather than 500ing a public
 * booking page, matching how surfaceAppearance and publicBrandingHidden treat
 * the same failure. Showing an extra question is recoverable; a page that will
 * not load is not.
 */
export async function applyConditionEntitlement(
  artistId: string,
  fields: CustomFieldDef[],
): Promise<CustomFieldDef[]> {
  // Nothing to decide, and no reason to spend an entitlement read, when no
  // field carries a condition. That is almost every artist.
  if (!fields.some((f) => f.condition)) return fields;

  let allowed = false;
  try {
    allowed = conditionalQuestionsAllowed(await getAccountOverrides(artistId));
  } catch {
    allowed = false;
  }
  if (allowed) return fields;
  return fields.map((f) => (f.condition ? { ...f, condition: null } : f));
}

/**
 * The WRITE side of the same gate: may this artist store this condition?
 *
 * Setting a NEW condition is refused for an un-entitled artist. Keeping the
 * one already stored is not, because an artist editing a field's label should
 * never have their logic deleted as a side effect of a plan they did not
 * change. `previous` is what the row currently holds.
 *
 * Refuses on a plan-read blip, matching saveAppearanceCore: on the write path
 * an unverified plan is a reason to stop, not to proceed.
 */
export async function conditionWriteAllowed(
  artistId: string,
  next: unknown,
  previous: unknown,
): Promise<boolean> {
  if (!next) return true; // clearing is always allowed
  // Unchanged conditions ride along untouched on every unrelated save.
  if (previous && JSON.stringify(next) === JSON.stringify(previous))
    return true;
  try {
    return conditionalQuestionsAllowed(await getAccountOverrides(artistId));
  } catch {
    return false;
  }
}
