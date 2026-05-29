import { z } from "zod";

export const SIZES = ["palm-sized", "hand-sized", "forearm", "larger"] as const;

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
