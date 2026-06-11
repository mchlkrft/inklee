import { z } from "zod";

// Booking email templates — the editor-facing pieces shared by the web
// settings page, the /api/mobile routes (apps/web) and the Expo editor
// screens, so the type list, labels, merge variables and body validation
// cannot drift between surfaces. The default subjects/bodies and all
// send-time rendering stay server-only in
// apps/web/src/lib/email/booking-templates.ts.

/** Merge variables a template body may reference as `{{var}}`. */
export const ALLOWED_VARS = [
  "customer_handle",
  "artist_name",
  "artist_slug",
  "date",
  "placement",
  "size",
  "magic_link",
] as const;

export type TemplateVars = Partial<
  Record<(typeof ALLOWED_VARS)[number], string>
>;

/** The five per-status booking emails an artist can customise, with their
 *  human labels. Array order = display order on web and mobile. */
export const EMAIL_TEMPLATE_TYPES = [
  {
    type: "customer_booking_submitted",
    label: "Booking received (to customer)",
  },
  {
    type: "customer_booking_approved",
    label: "Booking approved (to customer)",
  },
  {
    type: "customer_booking_rejected",
    label: "Booking rejected (to customer)",
  },
  {
    type: "customer_booking_cancelled_by_artist",
    label: "You cancelled (to customer)",
  },
  {
    type: "artist_new_booking_request",
    label: "New request (to you)",
  },
] as const;

export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number]["type"];

export function isEmailTemplateType(v: unknown): v is EmailTemplateType {
  return (
    typeof v === "string" && EMAIL_TEMPLATE_TYPES.some((t) => t.type === v)
  );
}

/** Validation for a custom template body. Authoritative on the server (the
 *  save routes re-run it); the mobile editor also pre-validates with the same
 *  schema for instant inline errors. */
export const templateBodySchema = z
  .string()
  .min(1, "Body is required")
  .max(2000, "Max 2000 characters")
  .refine((s) => !/<[^>]*>/.test(s), { message: "HTML tags are not allowed" })
  .refine((s) => !/javascript:/i.test(s), {
    message: "javascript: is not allowed",
  })
  .refine((s) => !/on\w+\s*=/i.test(s), {
    message: "Event handlers are not allowed",
  });
