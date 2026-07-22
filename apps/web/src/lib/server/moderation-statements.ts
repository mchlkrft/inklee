import "server-only";
import { serviceClient } from "@/lib/supabase/service";

// DSA Art. 17 statement-of-reasons register for the tattoo directory.
// See docs/dsa-moderation-procedure.md §3: every moderation action that hides,
// removes, or flags a listing records one row here carrying what was done, on
// what grounds, whether automated means were used, and who the statement is
// owed to.
//
// Populating the register is step one. Delivering the statement to the affected
// party (an email or in-app notice) is a separate follow-up, so `delivered_at`
// stays null until that path exists; `delivered_to` is resolved now so the
// delivery job has the recipient ready.
//
// A statement write must NEVER abort the moderation action itself: hiding a
// scam listing is a safety action and matters more than the register row. Every
// path here swallows its own failure and returns null, and callers log whether
// the statement was recorded so a miss is observable without blocking the fix.

export type MapModerationAction = "hidden" | "removed" | "warning_shown";

const ACTION_SENTENCE: Record<MapModerationAction, string> = {
  hidden: "This map listing was hidden from public and signed-in discovery.",
  removed: "This map listing was removed from the directory.",
  warning_shown:
    "This map listing was flagged as possibly closed. It stays visible with a warning until a studio confirms it is open.",
};

// Human-readable "why" for a report-driven action, keyed by map_reports.reason
// (migration 0098 added closed / outdated_details to the original abuse set).
const REPORT_REASON_PHRASE: Record<string, string> = {
  closed: "a report indicated this studio has closed",
  outdated_details: "a report indicated this listing's details are out of date",
  wrong_location: "a report indicated this listing is at the wrong location",
  fake_studio: "a report indicated this may not be a real studio",
  spam: "a report flagged this listing as spam",
  scam: "a report flagged this listing as a scam",
  behavior:
    "a report described conduct that breaches the acceptable-use policy",
  other: "a user report about this listing",
};

/**
 * Compose a plain-language statement of reasons per docs/dsa-moderation-procedure.md
 * §3.2: what was done, why, the territorial/temporal scope, whether automated,
 * and the right of redress. `reason` is the specific "why" for this action.
 */
function composeGrounds(action: MapModerationAction, reason: string): string {
  return [
    ACTION_SENTENCE[action],
    `Why: ${reason}.`,
    "Scope: the Inklee tattoo directory, in effect until reversed by a studio confirmation or a successful appeal.",
    "Automated means: no. A person reviewed and took this action.",
    "Right of redress: reply to the action notice with new information and we will reconsider.",
  ].join(" ");
}

/**
 * Turn a map_reports reason into the "why" sentence for a statement. Uses the
 * category phrase ONLY: the reporter's free-text detail is deliberately left out
 * because grounds are destined for delivery to the reported party, and echoing a
 * reporter's raw words there could de-anonymize the reporter or relay unvetted
 * text. The detail stays admin-side on the map_reports row.
 */
export function reportReasonToGrounds(reason: string | null): string {
  return REPORT_REASON_PHRASE[reason ?? "other"] ?? REPORT_REASON_PHRASE.other;
}

type RecordInput = {
  // The listing acted on. Pass null when the row is already gone (a hard delete
  // of an unclaimed seed), in which case the register keeps only the grounds.
  mapLocationId: string | null;
  action: MapModerationAction;
  // The specific, human-readable reason this action was taken.
  reason: string;
  // The report this action resolved, if any. Links the report back to the
  // statement it produced (map_reports.statement_of_reasons_id).
  reportId?: string;
};

/**
 * Record one Art. 17 statement of reasons and, when the action resolved a
 * report, link the report to it. Returns the statement id, or null if the
 * register write failed (the caller proceeds regardless).
 */
export async function recordMapModerationStatement(
  input: RecordInput,
): Promise<string | null> {
  try {
    return await insertStatement(input);
  } catch {
    // A register-write failure (a thrown network/transport error, not just a
    // returned { error }) must never abort the moderation action. Return null;
    // the caller logs statement_recorded:false and proceeds.
    return null;
  }
}

async function insertStatement(input: RecordInput): Promise<string | null> {
  // Deliver to the studio owner when the listing is a claimed studio. An
  // unclaimed seed (or an already-deleted row) has no owner, so delivered_to
  // stays null; the register row still stands as the statement of reasons.
  let deliveredTo: string | null = null;
  if (input.mapLocationId) {
    const { data: loc } = await serviceClient
      .from("map_locations")
      .select("studio_profile_id")
      .eq("id", input.mapLocationId)
      .maybeSingle();
    const studioProfileId = loc?.studio_profile_id as string | null | undefined;
    if (studioProfileId) {
      const { data: studio } = await serviceClient
        .from("studio_profiles")
        .select("owner_user_id")
        .eq("id", studioProfileId)
        .maybeSingle();
      deliveredTo = (studio?.owner_user_id as string | null) ?? null;
    }
  }

  const { data: stmt, error } = await serviceClient
    .from("moderation_statements")
    .insert({
      target_type: "location",
      target_map_location_id: input.mapLocationId,
      action: input.action,
      grounds: composeGrounds(input.action, input.reason),
      automated: false,
      delivered_to: deliveredTo,
      delivered_at: null,
    })
    .select("id")
    .maybeSingle();
  if (error || !stmt?.id) return null;

  const statementId = stmt.id as string;
  if (input.reportId) {
    // Best-effort back-link; a failure here does not undo the statement.
    await serviceClient
      .from("map_reports")
      .update({ statement_of_reasons_id: statementId })
      .eq("id", input.reportId);
  }
  return statementId;
}
