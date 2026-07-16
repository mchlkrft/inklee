// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "inactive_day_60",
  name: "Inactive after setup, day 60",
  status: "draft",
  audienceKey: "inactive_day_60",
  throttleDays: 7,
  preferenceCategory: "lifecycle",
  subject: "Is Inklee not fitting your workflow yet?",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">You set up Inklee a while ago and things have been quiet since. That usually means something about it did not fit how you actually book.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Every artist runs bookings differently, and Inklee should bend to that, not the other way around. Two sentences through the support form about what was missing or awkward tell us more than any usage chart.</p><div style="margin-top:20px;"><a href="https://inklee.app/support" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Tell us what did not fit</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="https://inklee.app/support" style="font-size:12px;color:#6b7280;word-break:break-all;">https://inklee.app/support</a></div>',
  text: "Hi {{artist_name}},\n\nYou set up Inklee a while ago and things have been quiet since. That usually means something about it did not fit how you actually book.\n\nEvery artist runs bookings differently, and Inklee should bend to that, not the other way around. Two sentences through the support form about what was missing or awkward tell us more than any usage chart.\n\nTell us what did not fit: https://inklee.app/support",
};
