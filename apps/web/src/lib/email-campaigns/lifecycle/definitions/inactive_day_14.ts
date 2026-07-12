// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "inactive_day_14",
  name: "Inactive after setup, day 14",
  status: "active",
  audienceKey: "inactive_day_14",
  throttleDays: 7,
  preferenceCategory: "lifecycle",
  subject: "One simple way to reduce booking chaos",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">One Inklee feature does most of the work: the request form.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Every request that comes through it arrives with placement, size, references, dates and client contact info already filled in. That is the exact set of details most artists chase across DMs for days. Point people at your link and let the form do the collecting.</p><div style="margin-top:20px;"><a href="https://inklee.app/dashboard" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Open Inklee</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="https://inklee.app/dashboard" style="font-size:12px;color:#6b7280;word-break:break-all;">https://inklee.app/dashboard</a></div>',
  text: "Hi {{artist_name}},\n\nOne Inklee feature does most of the work: the request form.\n\nEvery request that comes through it arrives with placement, size, references, dates and client contact info already filled in. That is the exact set of details most artists chase across DMs for days. Point people at your link and let the form do the collecting.\n\nOpen Inklee: https://inklee.app/dashboard",
};
