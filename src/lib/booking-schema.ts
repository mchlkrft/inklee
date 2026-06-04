import { z } from "zod";

export const SIZES = ["palm-sized", "hand-sized", "forearm", "larger"] as const;

// Client-facing labels for each size option. The booking form shows
// label + hint together so the client picks against a concrete measurement.
// Lives here (not in the form component) so server views can render the same
// label the client saw — the stored value is only the key, e.g. "forearm".
export const SIZE_LABELS: Record<
  (typeof SIZES)[number],
  { label: string; hint: string }
> = {
  "palm-sized": { label: "Palm-sized", hint: "~ 5 cm" },
  "hand-sized": { label: "Hand-sized", hint: "~ 10 cm" },
  forearm: { label: "Forearm", hint: "~ 15-20 cm" },
  larger: { label: "Larger", hint: "20 cm+" },
};

// Render a stored size key as the full client-facing label (e.g.
// "Forearm · ~ 15-20 cm") so the artist sees exactly what the client picked,
// not just the bare key. Falls back to the raw value for unknown/legacy/empty
// entries so older bookings and custom values still render something sensible.
export function formatSize(value: string | null | undefined): string {
  if (!value) return "";
  const entry = SIZE_LABELS[value as (typeof SIZES)[number]];
  return entry ? `${entry.label} · ${entry.hint}` : value;
}

export const bookingSchema = z.object({
  // Instagram + the others are conditionally shown; presence is enforced in the
  // action. Email is always required (most of Inklee's flow runs over email).
  instagram_handle: z.string().transform((s) => s.replace(/^@/, "").trim()),
  email: z.string().email("valid email required"),
  placement: z.string().max(200),
  size: z.union([z.enum(SIZES), z.literal("")]),
  preferred_date: z.string(),
  // Always-present fields
  reference_link: z
    .string()
    .url("must be a valid url")
    .or(z.literal(""))
    .optional(),
  description: z.string().max(1000, "max 1000 characters"),
});

export type BookingInput = z.infer<typeof bookingSchema>;
