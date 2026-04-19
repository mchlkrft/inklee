import { z } from "zod";

export const SIZES = ["palm-sized", "hand-sized", "forearm", "larger"] as const;

export const bookingSchema = z.object({
  instagram_handle: z
    .string()
    .min(1, "instagram handle is required")
    .transform((s) => s.replace(/^@/, "").trim()),
  email: z.string().email("valid email required"),
  reference_link: z
    .string()
    .url("must be a valid url")
    .or(z.literal(""))
    .optional(),
  placement: z.string().min(1, "placement is required").max(200),
  size: z.enum(SIZES, { error: "please select a size" }),
  description: z
    .string()
    .min(1, "description is required")
    .max(1000, "max 1000 characters"),
  preferred_date: z.string().min(1, "preferred date is required"),
  website: z.string().optional(), // honeypot
});

export type BookingInput = z.infer<typeof bookingSchema>;
