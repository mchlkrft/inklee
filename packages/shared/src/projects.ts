// Large-project mode (Plus build P4).
//
// A specialized intake for back pieces, sleeves, bodysuits and multi-session
// cover-ups. A submitted intake creates a dedicated long-term PROJECT record,
// not a standard booking request (plus-product-spec.md section 7).
//
// The v1 shape, and what it deliberately is NOT:
//
// - Sessions are not a new entity. A nullable `project_id` on
//   `booking_requests` links each session to its project, so deposits, the
//   calendar, reminders and every lifecycle email keep working through
//   pipelines that already exist. Inventing a session entity would mean
//   re-deriving all of that, for a v1 whose promise is "a record that does not
//   become a standard booking request".
// - Seven lifecycle states, not the spec's eventual twelve. The four missing
//   ones (consultation requested / scheduled, planning, sessions proposed,
//   paused) collapse into `consultation` and `active`, where the LINKED
//   BOOKINGS already carry the granular truth. Widening an enum later is
//   additive; shipping twelve states with no session engine is ceremony.
// - No artist-defined custom questions on this intake in v1. `custom_fields`
//   are scoped to the booking form and appear on it; silently reusing them
//   here would put questions an artist wrote for one form onto a different
//   one. A project-scoped field set is a later slice.
// - NO health or medical questions. The spec requires any health intake to be
//   separately justified and reviewed, so v1 asks nothing of the kind, and the
//   validated field list below is closed rather than free-form.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Lifecycle

export const PROJECT_STATUSES = [
  "submitted",
  "under_review",
  "consultation",
  "active",
  "completed",
  "declined",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; description: string; terminal: boolean }
> = {
  submitted: {
    label: "New",
    description: "Waiting for you to look at it.",
    terminal: false,
  },
  under_review: {
    label: "Reviewing",
    description: "You are working out whether to take it on.",
    terminal: false,
  },
  consultation: {
    label: "Consultation",
    description: "Talking it through before any dates are set.",
    terminal: false,
  },
  active: {
    label: "Active",
    description: "In progress. Sessions are booked against it.",
    terminal: false,
  },
  completed: {
    label: "Completed",
    description: "Finished.",
    terminal: true,
  },
  declined: {
    label: "Declined",
    description: "You passed on this one.",
    terminal: true,
  },
  archived: {
    label: "Archived",
    description: "Hidden from your list. Nothing is deleted.",
    terminal: true,
  },
};

/**
 * Allowed transitions. Deliberately permissive in the middle of the lifecycle
 * (a project can go back to consultation from active, because real projects
 * stall and restart) and strict at the edges: nothing leaves `archived` except
 * an explicit un-archive, and `declined` cannot silently become `active`.
 */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  submitted: ["under_review", "consultation", "active", "declined", "archived"],
  under_review: ["consultation", "active", "declined", "archived"],
  consultation: ["active", "under_review", "declined", "archived"],
  active: ["consultation", "completed", "archived"],
  completed: ["active", "archived"],
  declined: ["archived"],
  // Un-archiving returns a project to the list. It lands in `under_review`
  // rather than its previous state, because the previous state is not stored
  // and guessing it would be worse than one honest step.
  archived: ["under_review"],
};

export function canTransitionProject(
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  return PROJECT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isProjectStatus(v: unknown): v is ProjectStatus {
  return (
    typeof v === "string" && (PROJECT_STATUSES as readonly string[]).includes(v)
  );
}

/** The statuses a project list shows by default: everything still live. */
export const OPEN_PROJECT_STATUSES: ProjectStatus[] = [
  "submitted",
  "under_review",
  "consultation",
  "active",
];

// ---------------------------------------------------------------------------
// Intake vocabularies. All closed lists: a public intake writing free text
// into a field an artist filters on is how a filter stops working.

export const BODY_AREAS = [
  { key: "back", label: "Back" },
  { key: "chest", label: "Chest" },
  { key: "stomach", label: "Stomach" },
  { key: "full_sleeve", label: "Full sleeve" },
  { key: "half_sleeve", label: "Half sleeve" },
  { key: "forearm", label: "Forearm" },
  { key: "upper_arm", label: "Upper arm" },
  { key: "hand", label: "Hand" },
  { key: "leg_sleeve", label: "Leg sleeve" },
  { key: "thigh", label: "Thigh" },
  { key: "calf", label: "Calf" },
  { key: "ribs", label: "Ribs" },
  { key: "neck", label: "Neck" },
  { key: "bodysuit", label: "Bodysuit" },
] as const;
export type BodyAreaKey = (typeof BODY_AREAS)[number]["key"];
const BODY_AREA_KEYS = new Set(BODY_AREAS.map((a) => a.key));

export const PROJECT_SCALES = [
  { key: "large_single", label: "One large piece" },
  { key: "multi_session", label: "Multi-session piece" },
  { key: "sleeve", label: "Full sleeve" },
  { key: "back_piece", label: "Back piece" },
  { key: "bodysuit", label: "Bodysuit or larger" },
] as const;
export type ProjectScale = (typeof PROJECT_SCALES)[number]["key"];

export const SESSION_COMMITMENTS = [
  { key: "unsure", label: "Not sure yet" },
  { key: "few", label: "A few sessions" },
  { key: "many", label: "Many sessions over months" },
  { key: "open_ended", label: "Open-ended, however long it takes" },
] as const;
export type SessionCommitment = (typeof SESSION_COMMITMENTS)[number]["key"];

export const CONSULTATION_METHODS = [
  { key: "in_person", label: "In person" },
  { key: "video", label: "Video call" },
  { key: "message", label: "Messages" },
  { key: "any", label: "Whatever suits you" },
] as const;
export type ConsultationMethod = (typeof CONSULTATION_METHODS)[number]["key"];

export const COVERAGE_LEVELS = [
  { key: "none", label: "No existing tattoos there" },
  { key: "some", label: "Some existing tattoos" },
  { key: "heavy", label: "Heavily tattooed" },
  { key: "cover_up", label: "Needs a cover-up" },
] as const;
export type CoverageLevel = (typeof COVERAGE_LEVELS)[number]["key"];

function keySet<T extends readonly { key: string }[]>(list: T) {
  return new Set(list.map((i) => i.key));
}
const SCALE_KEYS = keySet(PROJECT_SCALES);
const COMMITMENT_KEYS = keySet(SESSION_COMMITMENTS);
const METHOD_KEYS = keySet(CONSULTATION_METHODS);
const COVERAGE_KEYS = keySet(COVERAGE_LEVELS);

// ---------------------------------------------------------------------------
// Intake validation

export const PROJECT_TITLE_MAX = 120;
export const PROJECT_DESCRIPTION_MAX = 4000;
export const PROJECT_GOAL_MAX = 2000;
export const PROJECT_NOTE_MAX = 4000;
export const PROJECT_MAX_BODY_AREAS = 6;
export const PROJECT_MAX_STYLES = 5;
/** Body photographs plus references. Higher than a booking's cap because the
 *  whole point of this intake is assessing existing coverage across areas. */
export const PROJECT_MAX_IMAGES = 12;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const projectIntakeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give your project a short title.")
    .max(PROJECT_TITLE_MAX),
  description: z
    .string()
    .trim()
    .min(20, "Tell the artist what you have in mind.")
    .max(PROJECT_DESCRIPTION_MAX),
  longTermGoal: optionalText(PROJECT_GOAL_MAX),
  bodyAreas: z
    .array(z.string())
    .min(1, "Choose at least one body area.")
    .max(PROJECT_MAX_BODY_AREAS)
    .refine(
      (a) => a.every((k) => BODY_AREA_KEYS.has(k as BodyAreaKey)),
      "Unknown body area.",
    ),
  coverage: z
    .string()
    .refine((v) => COVERAGE_KEYS.has(v), "Unknown coverage level.")
    .optional(),
  availableAreas: optionalText(PROJECT_GOAL_MAX),
  styles: z.array(z.string()).max(PROJECT_MAX_STYLES).default([]),
  scale: z.string().refine((v) => SCALE_KEYS.has(v), "Unknown scale."),
  sessionCommitment: z
    .string()
    .refine((v) => COMMITMENT_KEYS.has(v), "Unknown session commitment.")
    .optional(),
  travelAvailability: optionalText(PROJECT_GOAL_MAX),
  // Budget is optional by design: the spec allows it "where legally and
  // commercially appropriate", and a required budget on a public intake turns
  // an enquiry into a negotiation before the artist has said a word.
  budgetMinCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  budgetMaxCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  consultationMethod: z
    .string()
    .refine((v) => METHOD_KEYS.has(v), "Unknown consultation method.")
    .optional(),
  customerEmail: z.string().trim().email("Enter a valid email address."),
  customerHandle: optionalText(100),
});

export type ProjectIntakeInput = z.infer<typeof projectIntakeSchema>;

/** Cross-field rule kept out of the schema so the message can name the pair. */
export function validateBudgetRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null || max == null) return null;
  if (max < min) return "The budget range ends below where it starts.";
  return null;
}

// ---------------------------------------------------------------------------
// The stored record

export type ProjectRecord = {
  id: string;
  artist_id: string;
  customer_email: string;
  customer_handle: string | null;
  title: string;
  description: string;
  long_term_goal: string | null;
  body_areas: string[];
  coverage: string | null;
  available_areas: string | null;
  styles: string[];
  scale: string;
  session_commitment: string | null;
  travel_availability: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  consultation_method: string | null;
  status: ProjectStatus;
  artist_note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
};

/** Human label for a stored vocabulary key, falling back to the raw key so a
 *  value written before a vocabulary entry was removed still renders. */
export function labelForKey(
  list: readonly { key: string; label: string }[],
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  return list.find((i) => i.key === key)?.label ?? key;
}

/** The budget range as one display string, or null when unset. Formatting the
 *  amount stays with the caller (the money helpers are currency-aware). */
export function budgetRangeLabel(
  min: number | null,
  max: number | null,
  format: (cents: number) => string,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${format(min)} to ${format(max)}`;
  if (min != null) return `From ${format(min)}`;
  return `Up to ${format(max as number)}`;
}
