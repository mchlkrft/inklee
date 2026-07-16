// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "inactive_day_30",
  name: "Inactive after setup, day 30",
  status: "draft",
  audienceKey: "inactive_day_30",
  throttleDays: 7,
  preferenceCategory: "lifecycle",
  subject: "A useful Inklee feature you may have missed",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">If requests tend to arrive at the wrong time, books-open mode is worth a look.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Open your books when you want new work and close them when you are booked out; your page tells clients which it is, so you do not have to. Closed books are not silence, and open books bring requests in structured.</p><div style="margin-top:20px;"><a href="https://inklee.app/settings/books" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Open books settings</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="https://inklee.app/settings/books" style="font-size:12px;color:#6b7280;word-break:break-all;">https://inklee.app/settings/books</a></div>',
  text: "Hi {{artist_name}},\n\nIf requests tend to arrive at the wrong time, books-open mode is worth a look.\n\nOpen your books when you want new work and close them when you are booked out; your page tells clients which it is, so you do not have to. Closed books are not silence, and open books bring requests in structured.\n\nOpen books settings: https://inklee.app/settings/books",
};
