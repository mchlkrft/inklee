export interface FormSettings {
  // Standard fields (all default on)
  show_instagram_handle: boolean;
  show_email: boolean;
  show_placement: boolean;
  show_size: boolean;
  show_preferred_date: boolean;
  // Configurable fields
  show_reference_link: boolean;
  show_image_upload: boolean;
  require_description: boolean;
  allow_photo_annotations: boolean;
}

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  show_instagram_handle: true,
  show_email: true,
  show_placement: true,
  show_size: true,
  show_preferred_date: true,
  show_reference_link: true,
  show_image_upload: true,
  require_description: true,
  allow_photo_annotations: false,
};

// Canonical IDs for standard fields in field_order arrays
export const STD_FIELD_IDS = [
  "instagram_handle",
  "email",
  "reference_link",
  "placement",
  "size",
  "description",
  "image_upload",
  "preferred_date",
] as const;

export type StdFieldId = (typeof STD_FIELD_IDS)[number];

/** Default field order: contact → description → placement → size → references → date. */
export function buildDefaultFieldOrder(customFieldIds: string[]): string[] {
  // Existing per-artist `field_order` overrides this — only affects fresh accounts.
  return [
    "instagram_handle",
    "email",
    "description",
    "placement",
    "size",
    ...customFieldIds,
    "reference_link",
    "image_upload",
    "preferred_date",
  ];
}

/** Insert a new custom field ID just before image_upload (or preferred_date, or at end). */
export function insertFieldId(order: string[], newId: string): string[] {
  for (const anchor of ["image_upload", "preferred_date"] as const) {
    const idx = order.indexOf(anchor);
    if (idx !== -1) {
      return [...order.slice(0, idx), newId, ...order.slice(idx)];
    }
  }
  return [...order, newId];
}

export function parseFormSettings(raw: unknown): FormSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FORM_SETTINGS };
  const r = raw as Record<string, unknown>;
  function bool(key: keyof FormSettings): boolean {
    return typeof r[key] === "boolean"
      ? (r[key] as boolean)
      : DEFAULT_FORM_SETTINGS[key];
  }
  return {
    show_instagram_handle: bool("show_instagram_handle"),
    show_email: bool("show_email"),
    show_placement: bool("show_placement"),
    show_size: bool("show_size"),
    show_preferred_date: true,
    show_reference_link: bool("show_reference_link"),
    show_image_upload: bool("show_image_upload"),
    require_description: bool("require_description"),
    allow_photo_annotations: bool("allow_photo_annotations"),
  };
}
