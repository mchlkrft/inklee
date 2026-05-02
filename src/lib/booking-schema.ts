import { z } from "zod";

export const SIZES = ["palm-sized", "hand-sized", "forearm", "larger"] as const;

export const bookingSchema = z.object({
  // These 5 fields are conditionally shown; presence is enforced in the action
  instagram_handle: z.string().transform((s) => s.replace(/^@/, "").trim()),
  email: z.union([z.string().email("valid email required"), z.literal("")]),
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
