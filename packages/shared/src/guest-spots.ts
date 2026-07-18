// Guest spot request + stay state machines and request validation.
// Ported from the predecessor worktree (quarry verdict, Q12) with renames to
// avoid the studio-profile guest-spot-status vocabulary, and with documented
// transition supersets for the streamlined 2.0 v1 flow:
//   - submitted allows direct accept / decline / propose (the studio inbox
//     acts without an explicit under_review hop),
//   - alternative_dates_proposed allows accepted (artist takes the proposal),
//   - accepted allows confirmed directly (accepted is the materialization
//     intermediate: stay + trip leg are created between the two hops, so a
//     request stuck in accepted is a retryable acceptance),
//   - withdrawn is reachable from the studio-side review states (the artist
//     can pull out any time before confirmation).
// States are cheap; the full 14-state superset stays. Authorisation lives in
// the server cores, never here.

export type GuestSpotRequestStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "information_requested"
  | "alternative_dates_proposed"
  | "artist_reviewing_proposal"
  | "accepted"
  | "awaiting_confirmation"
  | "confirmed"
  | "declined"
  | "withdrawn"
  | "cancelled"
  | "completed"
  | "no_show";

const REQUEST_TRANSITIONS: Record<
  GuestSpotRequestStatus,
  GuestSpotRequestStatus[]
> = {
  draft: ["submitted", "withdrawn"],
  submitted: [
    "under_review",
    "information_requested",
    "alternative_dates_proposed",
    "accepted",
    "declined",
    "withdrawn",
  ],
  under_review: [
    "information_requested",
    "alternative_dates_proposed",
    "accepted",
    "declined",
    "withdrawn",
  ],
  information_requested: ["under_review", "declined", "withdrawn"],
  alternative_dates_proposed: [
    "artist_reviewing_proposal",
    // Self-loop: the studio can revise its suggestion (supersede semantics).
    "alternative_dates_proposed",
    "accepted",
    "declined",
    "withdrawn",
  ],
  artist_reviewing_proposal: [
    "accepted",
    "alternative_dates_proposed",
    "declined",
    "withdrawn",
  ],
  accepted: ["awaiting_confirmation", "confirmed", "cancelled"],
  awaiting_confirmation: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  declined: [],
  withdrawn: [],
  cancelled: [],
  completed: [],
  no_show: [],
};

export function canTransitionGuestSpotRequest(
  from: string,
  to: GuestSpotRequestStatus,
): { ok: true } | { ok: false; reason: string } {
  const allowed = REQUEST_TRANSITIONS[from as GuestSpotRequestStatus];
  if (!allowed) return { ok: false, reason: `unknown status: ${from}` };
  if (!allowed.includes(to)) {
    if (allowed.length === 0)
      return {
        ok: false,
        reason: `guest spot is already ${from}, no further changes allowed`,
      };
    return { ok: false, reason: `cannot move from ${from} to ${to}` };
  }
  return { ok: true };
}

export function isGuestSpotRequestTerminal(status: string): boolean {
  const allowed = REQUEST_TRANSITIONS[status as GuestSpotRequestStatus];
  return allowed !== undefined && allowed.length === 0;
}

export const GUEST_SPOT_REQUEST_STATUSES = Object.keys(
  REQUEST_TRANSITIONS,
) as GuestSpotRequestStatus[];

// Sentence-case display labels (one source, web + mobile).
export const GUEST_SPOT_REQUEST_STATUS_LABELS: Record<
  GuestSpotRequestStatus,
  string
> = {
  draft: "Draft",
  submitted: "Waiting for the studio",
  under_review: "Under review",
  information_requested: "Information requested",
  alternative_dates_proposed: "Other dates suggested",
  artist_reviewing_proposal: "Reviewing suggestion",
  accepted: "Accepted",
  awaiting_confirmation: "Awaiting confirmation",
  confirmed: "Confirmed",
  declined: "Passed",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

export function guestSpotRequestStatusLabel(status: string): string {
  return (
    GUEST_SPOT_REQUEST_STATUS_LABELS[status as GuestSpotRequestStatus] ??
    status
  );
}

/**
 * Request states a studio inbox treats as needing action. Kept in lockstep
 * with the one-open-request partial unique index in migration 0080.
 */
export const GUEST_SPOT_OPEN_STATUSES: GuestSpotRequestStatus[] = [
  "submitted",
  "under_review",
  "information_requested",
  "alternative_dates_proposed",
  "artist_reviewing_proposal",
  "accepted",
  "awaiting_confirmation",
];

// ---------------------------------------------------------------------------
// Stay FSM (ported unchanged). A confirmed request creates exactly one stay.

export type GuestSpotStayStatus =
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled"
  | "no_show";

const STAY_TRANSITIONS: Record<GuestSpotStayStatus, GuestSpotStayStatus[]> = {
  confirmed: ["active", "cancelled", "no_show"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransitionStay(
  from: string,
  to: GuestSpotStayStatus,
): { ok: true } | { ok: false; reason: string } {
  const allowed = STAY_TRANSITIONS[from as GuestSpotStayStatus];
  if (!allowed) return { ok: false, reason: `unknown stay status: ${from}` };
  if (!allowed.includes(to)) {
    if (allowed.length === 0)
      return {
        ok: false,
        reason: `stay is already ${from}, no further changes allowed`,
      };
    return { ok: false, reason: `cannot move stay from ${from} to ${to}` };
  }
  return { ok: true };
}

export function isStayTerminal(status: string): boolean {
  const allowed = STAY_TRANSITIONS[status as GuestSpotStayStatus];
  return allowed !== undefined && allowed.length === 0;
}

export const GUEST_SPOT_STAY_STATUSES = Object.keys(
  STAY_TRANSITIONS,
) as GuestSpotStayStatus[];

// ---------------------------------------------------------------------------
// Request submission validation (the locked fields: dates, social link,
// free-text purpose, expected clients, equipment needs).

export const DATE_FLEXIBILITIES = ["exact", "flexible", "range"] as const;
export type DateFlexibility = (typeof DATE_FLEXIBILITIES)[number];

export const DATE_FLEXIBILITY_LABELS: Record<DateFlexibility, string> = {
  exact: "These exact dates",
  flexible: "Dates are flexible",
  range: "Anywhere in this range",
};

export const GS_INTRO_MAX = 1000;
export const GS_EXPECTED_CLIENTS_MAX = 300;
export const GS_EQUIPMENT_MAX = 500;
export const GS_SOCIAL_LINK_MAX = 300;
export const GS_NOTE_MAX = 1000;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Shown wherever a studio-confirmed leg or its trip resists direct edits
// (approved default 4: the request flow is the only way those dates move).
export const GUEST_SPOT_LEG_LOCKED_MESSAGE =
  "This stay is managed through its guest spot. Cancel the guest spot to remove it.";

export type GuestSpotRequestInput = {
  startDate: string;
  endDate: string;
  dateFlexibility: string;
  socialLink: string;
  introduction: string;
  expectedClients?: string | null;
  equipmentNeeds?: string | null;
};

/**
 * Returns an error message or null. `todayKey` is the caller's YYYY-MM-DD
 * "today" so the check stays pure and testable.
 */
export function validateGuestSpotRequestInput(
  input: GuestSpotRequestInput,
  todayKey: string,
): string | null {
  if (!DATE_KEY.test(input.startDate) || !DATE_KEY.test(input.endDate))
    return "Pick your dates.";
  if (input.endDate < input.startDate)
    return "The end date cannot be before the start date.";
  if (input.startDate < todayKey)
    return "Guest spot dates need to be in the future.";
  if (
    !DATE_FLEXIBILITIES.includes(input.dateFlexibility as DateFlexibility)
  )
    return "Pick how fixed your dates are.";
  if (!input.socialLink?.trim())
    return "Add your Instagram or another social link.";
  if (input.socialLink.length > GS_SOCIAL_LINK_MAX)
    return "That link is too long.";
  if (!input.introduction?.trim())
    return "Tell the studio what you have in mind.";
  if (input.introduction.length > GS_INTRO_MAX)
    return `Keep the introduction under ${GS_INTRO_MAX} characters.`;
  if ((input.expectedClients ?? "").length > GS_EXPECTED_CLIENTS_MAX)
    return `Keep expected clients under ${GS_EXPECTED_CLIENTS_MAX} characters.`;
  if ((input.equipmentNeeds ?? "").length > GS_EQUIPMENT_MAX)
    return `Keep equipment needs under ${GS_EQUIPMENT_MAX} characters.`;
  return null;
}
