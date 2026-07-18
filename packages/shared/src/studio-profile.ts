// Inklee 2.0 studio profile vocabulary + validation + completeness.
// Pure and shared (web + mobile); mirrors the CHECK constraints in migration
// 0078. Studio mutations always run through a server core, but the shape
// rules live here so both platforms and the server agree.

export const ADDRESS_VISIBILITY_MODES = ["exact", "approximate"] as const;
export type AddressVisibility = (typeof ADDRESS_VISIBILITY_MODES)[number];

export const ADDRESS_VISIBILITY_LABELS: Record<AddressVisibility, string> = {
  exact: "Show the exact address",
  approximate: "Show the area only",
};

export const GUEST_SPOT_STATUSES = [
  "not_accepting",
  "accepting",
  "invitation_only",
] as const;
export type GuestSpotStatus = (typeof GUEST_SPOT_STATUSES)[number];

export const GUEST_SPOT_STATUS_LABELS: Record<GuestSpotStatus, string> = {
  not_accepting: "Not accepting guest spots",
  accepting: "Accepting guest spot requests",
  invitation_only: "Guest spots by invitation only",
};

export const PUBLICATION_STATUSES = ["draft", "published", "suspended"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

// Who is claiming (mirrors the location_claims CHECK from 0075).
export const CLAIMANT_ROLES = [
  "artist",
  "receptionist",
  "manager",
  "business_owner",
] as const;
export type ClaimantRole = (typeof CLAIMANT_ROLES)[number];

export const CLAIMANT_ROLE_LABELS: Record<ClaimantRole, string> = {
  artist: "Tattoo artist",
  receptionist: "Receptionist",
  manager: "Manager",
  business_owner: "Business owner",
};

export const CLAIM_EVIDENCE_MAX = 500;
export const CLAIM_ADDRESS_MAX = 200;
export const CLAIM_SOCIAL_LINK_MAX = 300;

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  pending: "Being checked",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
};

// Non-style standard categories (scope 4.3). The style-type standards
// (blackwork, fine_line, traditional, ...) are their own rows referencing the
// styles table, so they are not repeated here.
export const STUDIO_STANDARD_CATEGORIES = [
  "private_studio",
  "street_shop",
  "appointment_only",
  "walk_in_friendly",
  "vegan_supplies",
  "private_room_available",
  "piercing",
] as const;
export type StudioStandardCategory =
  (typeof STUDIO_STANDARD_CATEGORIES)[number];

export const STUDIO_STANDARD_CATEGORY_LABELS: Record<
  StudioStandardCategory,
  string
> = {
  private_studio: "Private studio",
  street_shop: "Street shop",
  appointment_only: "Appointment only",
  walk_in_friendly: "Walk-in friendly",
  vegan_supplies: "Vegan supplies",
  private_room_available: "Private room available",
  piercing: "Piercing",
};

export const MIN_STUDIO_CATEGORIES = 3;
export const MIN_STUDIO_PHOTOS = 3;
// Provisional per-studio photo cap (open question Q6: the provisional value
// is explicitly allowed to ship and be raised later; shipping without any
// cap is what cannot be undone). Founder-adjustable.
export const MAX_STUDIO_PHOTOS = 12;
export const STUDIO_NAME_MAX = 120;
export const STUDIO_DESCRIPTION_MAX = 2000;
export const STUDIO_VIBE_MAX = 500;
export const STUDIO_CUSTOM_CATEGORY_MAX = 40;
const TEXT_MAX = 200;

export type StudioProfileInput = {
  name: string;
  description?: string | null;
  vibe?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postalCode?: string | null;
  addressVisibility: string;
  guestSpotStatus: string;
  // Guest artist timeline on the studio's map page (Q16: artist privacy caps
  // it; non-consenting artists render anonymized). Optional and additive.
  showGuestTimeline?: boolean;
};

/** Returns an error message, or null when the profile fields are valid. */
export function validateStudioProfileInput(
  input: StudioProfileInput,
): string | null {
  const name = input.name?.trim() ?? "";
  if (!name) return "Studio name is required.";
  if (name.length > STUDIO_NAME_MAX)
    return `Name must be at most ${STUDIO_NAME_MAX} characters.`;
  if ((input.description ?? "").length > STUDIO_DESCRIPTION_MAX)
    return `Description must be at most ${STUDIO_DESCRIPTION_MAX} characters.`;
  if ((input.vibe ?? "").length > STUDIO_VIBE_MAX)
    return `Vibe must be at most ${STUDIO_VIBE_MAX} characters.`;
  for (const [label, value] of [
    ["Address", input.address],
    ["City", input.city],
    ["Country", input.country],
    ["Postal code", input.postalCode],
  ] as const) {
    if (value && value.length > TEXT_MAX)
      return `${label} must be at most ${TEXT_MAX} characters.`;
  }
  if (
    !ADDRESS_VISIBILITY_MODES.includes(
      input.addressVisibility as AddressVisibility,
    )
  )
    return "Pick a valid address visibility.";
  if (!GUEST_SPOT_STATUSES.includes(input.guestSpotStatus as GuestSpotStatus))
    return "Pick a valid guest spot status.";
  return null;
}

/** Normalize + validate a single custom category label. */
export function validateCustomCategory(label: string): string | null {
  const v = label.trim();
  if (!v) return "A custom category needs a name.";
  if (v.length > STUDIO_CUSTOM_CATEGORY_MAX)
    return `Custom category must be at most ${STUDIO_CUSTOM_CATEGORY_MAX} characters.`;
  return null;
}

// ---------------------------------------------------------------------------
// House rules (Phase 4 extension): structured, reusable studio-level rules.
// Optional on the studio profile, shown to requesting artists (approval is
// where rules start mattering), reused by the welcome pack and, later, the
// group. Typed keys only in v1; content is short free text per rule.

export const HOUSE_RULE_KEYS = [
  "deposit_policy",
  "client_handling",
  "cleaning",
  "supplies_included",
  "setup_breakdown",
  "opening_hours",
  "key_access",
  "promotion_rules",
  "walk_in_policy",
  "cancellation_expectations",
] as const;
export type HouseRuleKey = (typeof HOUSE_RULE_KEYS)[number];

export const HOUSE_RULE_LABELS: Record<HouseRuleKey, string> = {
  deposit_policy: "Deposit policy",
  client_handling: "Client handling",
  cleaning: "Cleaning",
  supplies_included: "Supplies included",
  setup_breakdown: "Setup and breakdown",
  opening_hours: "Opening hours",
  key_access: "Keys and access",
  promotion_rules: "Promotion",
  walk_in_policy: "Walk-ins",
  cancellation_expectations: "Cancellations",
};

export const HOUSE_RULE_CONTENT_MAX = 500;

export type HouseRuleInput = { key: string; content: string };

/** Returns an error message, or null when the rule set is valid. */
export function validateHouseRules(rules: HouseRuleInput[]): string | null {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (typeof rule?.key !== "string" || typeof rule?.content !== "string")
      return "Pick rules from the list.";
    if (!HOUSE_RULE_KEYS.includes(rule.key as HouseRuleKey))
      return "Pick rules from the list.";
    if (seen.has(rule.key)) return "Each rule can only appear once.";
    seen.add(rule.key);
    if (!rule.content?.trim())
      return `Write the ${HOUSE_RULE_LABELS[rule.key as HouseRuleKey].toLowerCase()} rule or remove it.`;
    if (rule.content.length > HOUSE_RULE_CONTENT_MAX)
      return `Keep each rule under ${HOUSE_RULE_CONTENT_MAX} characters.`;
  }
  return null;
}

/** Canonical display order: the vocabulary order, unknown keys last. */
export function sortHouseRules<T extends { key: string }>(rules: T[]): T[] {
  const order = new Map(HOUSE_RULE_KEYS.map((k, i) => [k as string, i]));
  return [...rules].sort(
    (a, b) =>
      (order.get(a.key) ?? HOUSE_RULE_KEYS.length) -
      (order.get(b.key) ?? HOUSE_RULE_KEYS.length),
  );
}

// ---------------------------------------------------------------------------
// Welcome pack (Phase 4 extension): saved, reusable, structured content a
// confirmed guest artist sees. Interaction plane only: unlike house rules
// (profile content, any logged-in artist), the pack is visible solely to
// artists with a confirmed stay at the studio. No PDF, no notification until
// Q9 is decided; the pack appears on the artist's request page after
// confirmation. Attachments wait for the private bucket.

export const WELCOME_PACK_FIELDS = [
  "access_details",
  "wifi",
  "emergency_contact",
  "supply_shops",
  "promotion_notes",
  "local_notes",
] as const;
export type WelcomePackField = (typeof WELCOME_PACK_FIELDS)[number];

export const WELCOME_PACK_FIELD_LABELS: Record<WelcomePackField, string> = {
  access_details: "Address and access",
  wifi: "Wifi",
  emergency_contact: "Emergency contact",
  supply_shops: "Nearby supply shops",
  promotion_notes: "Promotion",
  local_notes: "Local notes",
};

export const WELCOME_PACK_FIELD_MAX = 1000;

export type WelcomePackInput = {
  includeHouseRules: boolean;
} & Partial<Record<WelcomePackField, string | null>>;

/** Returns an error message, or null when the pack fields are valid. */
export function validateWelcomePackInput(
  input: WelcomePackInput,
): string | null {
  for (const field of WELCOME_PACK_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return "Fill the fields with text.";
    if (value.length > WELCOME_PACK_FIELD_MAX)
      return `Keep each section under ${WELCOME_PACK_FIELD_MAX} characters.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Studio media paths (the private studio-media bucket, keyed by STUDIO id so
// media survives owner changes and is never touched by the per-user purge).

export function studioLogoStoragePath(studioProfileId: string): string {
  return `${studioProfileId}/logo.webp`;
}

export function studioPhotoStoragePath(
  studioProfileId: string,
  photoId: string,
): string {
  return `${studioProfileId}/photos/${photoId}.webp`;
}

/**
 * Path-ownership guard for deletes (the goods-storage lesson): a storage
 * path may only be removed when it sits exactly under the studio's own
 * prefix and contains no traversal.
 */
export function isOwnedStudioMediaPath(
  studioProfileId: string,
  path: string,
): boolean {
  if (!studioProfileId || !path) return false;
  if (path.includes("..") || path.includes("\\")) return false;
  if (path === studioLogoStoragePath(studioProfileId)) return true;
  // Photos must match the builder's shape exactly: {id}/photos/{name}.webp
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === studioProfileId &&
    parts[1] === "photos" &&
    parts[2].length > ".webp".length &&
    parts[2].endsWith(".webp")
  );
}

// ---------------------------------------------------------------------------
// Completeness score + publish readiness. The completeness score improves map
// quality without nagging; it never blocks usage. Publish readiness is the
// locked minimum set that DOES gate publishing. Items whose features ship in
// later phases (workspace overview, house rules, resident artists) are added
// to this snapshot when they exist, per the build plan.

export type StudioSnapshot = {
  hasLogo: boolean;
  photoCount: number;
  hasDescription: boolean;
  hasAddress: boolean;
  categoryCount: number;
  hasVibe: boolean;
  houseRuleCount: number;
};

export type CompletenessItem = {
  key: string;
  /** Done-state phrasing for the checklist ("Logo added"). */
  label: string;
  /** Action phrasing for the "still to do" list ("Add a logo"). */
  todoLabel: string;
  done: boolean;
  /** Required items gate publishing; the rest just improve the score. */
  required: boolean;
};

export type StudioCompleteness = {
  items: CompletenessItem[];
  /** 0 to 100 across all items. */
  score: number;
  /** Action-phrased todo labels for the missing required items. */
  publishBlockers: string[];
  publishReady: boolean;
};

export function computeStudioCompleteness(
  snapshot: StudioSnapshot,
): StudioCompleteness {
  const items: CompletenessItem[] = [
    {
      key: "logo",
      label: "Logo added",
      todoLabel: "Add a logo",
      done: snapshot.hasLogo,
      required: true,
    },
    {
      key: "photos",
      label: `${MIN_STUDIO_PHOTOS}+ photos added`,
      todoLabel: `Add ${MIN_STUDIO_PHOTOS} or more photos`,
      done: snapshot.photoCount >= MIN_STUDIO_PHOTOS,
      required: true,
    },
    {
      key: "description",
      label: "Description written",
      todoLabel: "Write a description",
      done: snapshot.hasDescription,
      required: true,
    },
    {
      key: "address",
      label: "Address or area set",
      todoLabel: "Set your address or area",
      done: snapshot.hasAddress,
      required: true,
    },
    {
      key: "categories",
      label: `${MIN_STUDIO_CATEGORIES}+ categories chosen`,
      todoLabel: `Choose ${MIN_STUDIO_CATEGORIES} or more categories`,
      done: snapshot.categoryCount >= MIN_STUDIO_CATEGORIES,
      required: true,
    },
    {
      key: "vibe",
      label: "Vibe section written",
      todoLabel: "Write a vibe section",
      done: snapshot.hasVibe,
      required: false,
    },
    {
      key: "house-rules",
      label: "House rules set",
      todoLabel: "Set your house rules",
      done: snapshot.houseRuleCount > 0,
      required: false,
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const score = Math.round((doneCount / items.length) * 100);
  const publishBlockers = items
    .filter((i) => i.required && !i.done)
    .map((i) => i.todoLabel);
  return {
    items,
    score,
    publishBlockers,
    publishReady: publishBlockers.length === 0,
  };
}
