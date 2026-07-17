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
};

export type CompletenessItem = {
  key: string;
  label: string;
  done: boolean;
  /** Required items gate publishing; the rest just improve the score. */
  required: boolean;
};

export type StudioCompleteness = {
  items: CompletenessItem[];
  /** 0 to 100 across all items. */
  score: number;
  /** Missing required items block publishing. */
  publishBlockers: string[];
  publishReady: boolean;
};

export function computeStudioCompleteness(
  snapshot: StudioSnapshot,
): StudioCompleteness {
  const items: CompletenessItem[] = [
    { key: "logo", label: "Logo added", done: snapshot.hasLogo, required: true },
    {
      key: "photos",
      label: `${MIN_STUDIO_PHOTOS}+ photos added`,
      done: snapshot.photoCount >= MIN_STUDIO_PHOTOS,
      required: true,
    },
    {
      key: "description",
      label: "Description written",
      done: snapshot.hasDescription,
      required: true,
    },
    {
      key: "address",
      label: "Address or area set",
      done: snapshot.hasAddress,
      required: true,
    },
    {
      key: "categories",
      label: `${MIN_STUDIO_CATEGORIES}+ categories chosen`,
      done: snapshot.categoryCount >= MIN_STUDIO_CATEGORIES,
      required: true,
    },
    {
      key: "vibe",
      label: "Vibe section written",
      done: snapshot.hasVibe,
      required: false,
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const score = Math.round((doneCount / items.length) * 100);
  const publishBlockers = items
    .filter((i) => i.required && !i.done)
    .map((i) => i.label);
  return {
    items,
    score,
    publishBlockers,
    publishReady: publishBlockers.length === 0,
  };
}
