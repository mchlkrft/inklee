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
    show_preferred_date: bool("show_preferred_date"),
    show_reference_link: bool("show_reference_link"),
    show_image_upload: bool("show_image_upload"),
    require_description: bool("require_description"),
    allow_photo_annotations: bool("allow_photo_annotations"),
  };
}
