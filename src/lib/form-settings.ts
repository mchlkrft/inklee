export interface FormSettings {
  show_reference_link: boolean;
  show_image_upload: boolean;
  require_description: boolean;
  allow_photo_annotations: boolean;
}

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  show_reference_link: true,
  show_image_upload: true,
  require_description: true,
  allow_photo_annotations: false,
};

export function parseFormSettings(raw: unknown): FormSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FORM_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    show_reference_link:
      typeof r.show_reference_link === "boolean"
        ? r.show_reference_link
        : DEFAULT_FORM_SETTINGS.show_reference_link,
    show_image_upload:
      typeof r.show_image_upload === "boolean"
        ? r.show_image_upload
        : DEFAULT_FORM_SETTINGS.show_image_upload,
    require_description:
      typeof r.require_description === "boolean"
        ? r.require_description
        : DEFAULT_FORM_SETTINGS.require_description,
    allow_photo_annotations:
      typeof r.allow_photo_annotations === "boolean"
        ? r.allow_photo_annotations
        : DEFAULT_FORM_SETTINGS.allow_photo_annotations,
  };
}
