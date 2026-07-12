// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "setup_day_7",
  name: "Setup incomplete, day 7",
  status: "draft",
  audienceKey: "setup_incomplete_day_7",
  throttleDays: 1,
  preferenceCategory: "lifecycle",
  subject: "One last setup reminder",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">This is the last reminder about your unfinished setup.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">You can complete just the basics now, so the booking link is ready whenever you want to use it, and refine the details later. If Inklee is not the right fit at the moment, that is fine too; your account stays as it is.</p><div style="margin-top:20px;"><a href="https://inklee.app/onboarding" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Open setup</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="https://inklee.app/onboarding" style="font-size:12px;color:#6b7280;word-break:break-all;">https://inklee.app/onboarding</a></div>',
  text: "Hi {{artist_name}},\n\nThis is the last reminder about your unfinished setup.\n\nYou can complete just the basics now, so the booking link is ready whenever you want to use it, and refine the details later. If Inklee is not the right fit at the moment, that is fine too; your account stays as it is.\n\nOpen setup: https://inklee.app/onboarding",
};
