// Support-ticket domain rules: statuses, transitions, categories, validation
// bounds, and attention/unread derivations. Pure + Intl-free so the whole
// policy is unit-testable; the server actions and both UIs consume this one
// module instead of re-deriving any of it.

export const SUPPORT_STATUSES = [
  "open",
  "awaiting_support",
  "awaiting_artist",
  "resolved",
  "closed",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Open",
  awaiting_support: "Awaiting support",
  awaiting_artist: "Awaiting artist",
  resolved: "Resolved",
  closed: "Closed",
};

export function isSupportStatus(v: unknown): v is SupportStatus {
  return (
    typeof v === "string" && (SUPPORT_STATUSES as readonly string[]).includes(v)
  );
}

export const SUPPORT_CATEGORIES = [
  "account_login",
  "booking_requests",
  "calendar_availability",
  "public_page",
  "payments_deposits",
  "mobile_app",
  "notifications_email",
  "studio_team",
  "bug",
  "feature_question",
  "billing",
  "other",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  account_login: "Account and login",
  booking_requests: "Booking requests",
  calendar_availability: "Calendar and availability",
  public_page: "Public booking page",
  payments_deposits: "Payments and deposits",
  mobile_app: "Mobile app",
  notifications_email: "Notifications and email",
  studio_team: "Studio or team account",
  bug: "Bug or technical problem",
  feature_question: "Feature question",
  billing: "Billing",
  other: "Other",
};

export function isSupportCategory(v: unknown): v is SupportCategory {
  return (
    typeof v === "string" &&
    (SUPPORT_CATEGORIES as readonly string[]).includes(v)
  );
}

// ─── Transitions ─────────────────────────────────────────────────────────────

/** Whether the artist may add a reply in the ticket's current state. Closed
 *  tickets are read-only for artists; a reply on a resolved ticket reopens it. */
export function canArtistReply(status: SupportStatus): boolean {
  return status !== "closed";
}

/** Status after an artist reply. Returns null when the reply is not allowed. */
export function statusAfterArtistReply(
  status: SupportStatus,
): SupportStatus | null {
  if (!canArtistReply(status)) return null;
  return "awaiting_support";
}

/** Status after an admin reply, unless the admin explicitly picked one. */
export function statusAfterAdminReply(
  explicit: SupportStatus | null,
): SupportStatus {
  return explicit ?? "awaiting_artist";
}

// ─── Attention / unread derivations ─────────────────────────────────────────

type AttentionFields = {
  status: SupportStatus;
  last_artist_reply_at: string | null;
  last_admin_reply_at: string | null;
  artist_seen_at: string | null;
};

/** Admin side: the ticket is waiting on the Inklee team. */
export function needsAdminAttention(
  t: Pick<AttentionFields, "status">,
): boolean {
  return t.status === "open" || t.status === "awaiting_support";
}

/** Admin side: the artist wrote after the last admin reply (or the ticket has
 *  never been answered). Timestamps are ISO strings, comparable lexically. */
export function hasUnansweredArtistReply(
  t: Pick<AttentionFields, "last_artist_reply_at" | "last_admin_reply_at">,
): boolean {
  if (!t.last_artist_reply_at) return false;
  if (!t.last_admin_reply_at) return true;
  return t.last_artist_reply_at > t.last_admin_reply_at;
}

/** Artist side: support replied since the artist last opened the ticket. */
export function hasUnreadAdminReply(
  t: Pick<AttentionFields, "last_admin_reply_at" | "artist_seen_at">,
): boolean {
  if (!t.last_admin_reply_at) return false;
  if (!t.artist_seen_at) return true;
  return t.last_admin_reply_at > t.artist_seen_at;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export const SUPPORT_LIMITS = {
  subjectMin: 4,
  subjectMax: 150,
  descriptionMin: 20,
  descriptionMax: 5000,
  expectedMin: 5,
  expectedMax: 2000,
  actualMin: 5,
  actualMax: 2000,
  optionalMax: 2000,
  shortFieldMax: 200,
  replyMin: 2,
  replyMax: 5000,
} as const;

export type SupportTicketInput = {
  subject: string;
  category: string;
  description: string;
  expectedBehavior: string;
  actualBehavior: string;
  reproductionSteps: string;
  relevantArea: string;
  deviceInfo: string;
  platformInfo: string;
  additionalContext: string;
};

/** Validate a new-ticket submission. Returns a ready-to-show error, or null. */
export function validateTicketInput(input: SupportTicketInput): string | null {
  const L = SUPPORT_LIMITS;
  if (input.subject.length < L.subjectMin) {
    return "Add a short subject that summarizes the problem.";
  }
  if (input.subject.length > L.subjectMax) {
    return `Subject can be at most ${L.subjectMax} characters.`;
  }
  if (!isSupportCategory(input.category)) {
    return "Pick a category.";
  }
  if (input.description.length < L.descriptionMin) {
    return "Describe the problem in a bit more detail so we can investigate.";
  }
  if (input.description.length > L.descriptionMax) {
    return `Description can be at most ${L.descriptionMax} characters.`;
  }
  if (input.expectedBehavior.length < L.expectedMin) {
    return "Tell us what you expected to happen.";
  }
  if (input.expectedBehavior.length > L.expectedMax) {
    return `Expected behavior can be at most ${L.expectedMax} characters.`;
  }
  if (input.actualBehavior.length < L.actualMin) {
    return "Tell us what actually happened.";
  }
  if (input.actualBehavior.length > L.actualMax) {
    return `Actual behavior can be at most ${L.actualMax} characters.`;
  }
  if (input.reproductionSteps.length > L.optionalMax) {
    return `Steps to reproduce can be at most ${L.optionalMax} characters.`;
  }
  if (input.additionalContext.length > L.optionalMax) {
    return `Additional context can be at most ${L.optionalMax} characters.`;
  }
  if (input.relevantArea.length > L.shortFieldMax) {
    return `Relevant page or feature can be at most ${L.shortFieldMax} characters.`;
  }
  if (input.deviceInfo.length > L.shortFieldMax) {
    return `Device can be at most ${L.shortFieldMax} characters.`;
  }
  if (input.platformInfo.length > L.shortFieldMax) {
    return `Browser or app platform can be at most ${L.shortFieldMax} characters.`;
  }
  return null;
}

/** Validate a reply body. Returns a ready-to-show error, or null. */
export function validateReplyBody(body: string): string | null {
  if (body.trim().length < SUPPORT_LIMITS.replyMin) {
    return "Write a reply before sending.";
  }
  if (body.length > SUPPORT_LIMITS.replyMax) {
    return `Replies can be at most ${SUPPORT_LIMITS.replyMax} characters.`;
  }
  return null;
}

/** INK-1042 style reference guard (used for search parsing, not generation —
 *  generation is a DB sequence default). */
export const SUPPORT_REFERENCE_RE = /^INK-\d+$/;
