// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "first_booking_approved",
  name: "First booking approved",
  status: "draft",
  audienceKey: "first_booking_recent",
  throttleDays: 7,
  preferenceCategory: "lifecycle",
  subject: "Your first Inklee booking is confirmed",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">You approved your first booking through Inklee 🎉.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">The flow works end to end now: request in, details reviewed, appointment confirmed.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">From here it is about keeping it tidy. The calendar shows what is coming up, and if you get more requests than you can take, the waitlist and books-open mode keep intake under control. Easy peasy!</p><div style="margin-top:20px;"><a href="https://inklee.app/bookings/calendar" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Check upcoming bookings</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="https://inklee.app/bookings/calendar" style="font-size:12px;color:#6b7280;word-break:break-all;">https://inklee.app/bookings/calendar</a></div>',
  text: "Hi {{artist_name}},\n\nYou approved your first booking through Inklee 🎉.\n\nThe flow works end to end now: request in, details reviewed, appointment confirmed.\n\nFrom here it is about keeping it tidy. The calendar shows what is coming up, and if you get more requests than you can take, the waitlist and books-open mode keep intake under control. Easy peasy!\n\nCheck upcoming bookings: https://inklee.app/bookings/calendar",
};
