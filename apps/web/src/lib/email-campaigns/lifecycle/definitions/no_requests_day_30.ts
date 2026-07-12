// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "no_requests_day_30",
  name: "Booking page live, no requests, day 30",
  status: "active",
  audienceKey: "no_requests_day_30",
  throttleDays: 7,
  preferenceCategory: "lifecycle",
  subject: "Check if your form asks too much too early",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">When a booking page gets visits but no finished requests, the form is usually asking too much too early.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Keep the first contact light: placement, size, a reference image, rough dates and a way to reply. Anything you only need after you accept a project can wait until then. Fewer required questions means more clients actually finish the request.</p><div style="margin-top:20px;"><a href="https://inklee.app/bookings/form" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Adjust request form</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="https://inklee.app/bookings/form" style="font-size:12px;color:#6b7280;word-break:break-all;">https://inklee.app/bookings/form</a></div>',
  text: "Hi {{artist_name}},\n\nWhen a booking page gets visits but no finished requests, the form is usually asking too much too early.\n\nKeep the first contact light: placement, size, a reference image, rough dates and a way to reply. Anything you only need after you accept a project can wait until then. Fewer required questions means more clients actually finish the request.\n\nAdjust request form: https://inklee.app/bookings/form",
};
