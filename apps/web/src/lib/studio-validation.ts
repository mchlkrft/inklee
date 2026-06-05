import { z } from "zod";

export const VISIBILITY_MODES = [
  "public_exact_address",
  "public_area_only",
  "after_approval_only",
  "hidden",
] as const;

export type VisibilityMode = (typeof VISIBILITY_MODES)[number];

export const VISIBILITY_LABELS: Record<VisibilityMode, string> = {
  public_exact_address: "Show exact address publicly",
  public_area_only: "Show city/area only",
  after_approval_only: "Share address after approval",
  hidden: "Hide from booking form",
};

const studioSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  city: z.string().max(100).optional().default(""),
  country: z.string().max(100).optional().default(""),
  address: z.string().max(300).optional().nullable(),
  google_place_id: z.string().max(300).optional().nullable(),
  formatted_address: z.string().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  google_maps_url: z.string().max(1000).optional().nullable(),
  visibility_mode: z.enum(VISIBILITY_MODES).default("hidden"),
  public_note: z.string().max(500).optional().nullable(),
  is_primary: z.boolean().default(false),
});

export type StudioInput = z.infer<typeof studioSchema>;

export function parseStudioFormData(formData: FormData): StudioInput {
  const lat = (formData.get("latitude") as string | null) || null;
  const lng = (formData.get("longitude") as string | null) || null;

  return studioSchema.parse({
    name: (formData.get("name") as string)?.trim(),
    city: (formData.get("city") as string)?.trim() || "",
    country: (formData.get("country") as string)?.trim() || "",
    address: (formData.get("address") as string)?.trim() || null,
    google_place_id:
      (formData.get("google_place_id") as string)?.trim() || null,
    formatted_address:
      (formData.get("formatted_address") as string)?.trim() || null,
    latitude: lat ? parseFloat(lat) : null,
    longitude: lng ? parseFloat(lng) : null,
    google_maps_url:
      (formData.get("google_maps_url") as string)?.trim() || null,
    visibility_mode: (formData.get("visibility_mode") as string) || "hidden",
    public_note: (formData.get("public_note") as string)?.trim() || null,
    is_primary: formData.get("is_primary") === "true",
  });
}
