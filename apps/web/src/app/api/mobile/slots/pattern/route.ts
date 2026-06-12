import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { createSlotsFromPattern } from "@/lib/server/slots";
import {
  expandPatternDates,
  validateSlotPattern,
} from "@inklee/shared/slot-pattern";
import type { MobileSlotPatternResult } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/slots/pattern — create slots from a pattern (time windows x
// specific dates or weekdays in a range). The body is the shared
// SlotPatternInput; validation, expansion and the insert run through the SAME
// shared core the web createSlotsFromPatternAction uses, including the
// best-effort auto-resolve of the no-slots warning.
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

  const parsed = validateSlotPattern(body);
  if (!parsed.ok) return mobileError(400, parsed.error);

  // User input, not a server fault: pre-check via the same shared expansion
  // the core runs, so an empty weekday range is a 400 (the core's own check
  // remains as a backstop and would otherwise surface as a 500).
  if (expandPatternDates(parsed.value).length === 0) {
    return mobileError(400, "No matching dates in that range.");
  }

  const result = await createSlotsFromPattern(supabase, userId, parsed.value);
  if (!result.ok) return mobileError(500, result.error);

  const out: MobileSlotPatternResult = { count: result.count };
  return mobileOk(out);
}
