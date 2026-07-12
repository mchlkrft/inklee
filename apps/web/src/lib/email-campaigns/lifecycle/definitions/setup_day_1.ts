// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "setup_day_1",
  name: "Setup incomplete, day 1",
  status: "active",
  audienceKey: "setup_incomplete_day_1",
  throttleDays: 1,
  preferenceCategory: "lifecycle",
  subject: "Your Inklee booking link is almost ready",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Your booking link is close to being usable. A few setup steps are left before clients can send you proper requests.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Once it is live, a request arrives with placement, size, references, dates and contact info in one place, instead of scattered across DMs.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Pick it up where you left off; the remaining steps are short.</p><div style="margin-top:20px;"><a href="https://inklee.app/onboarding" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Finish setup</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="https://inklee.app/onboarding" style="font-size:12px;color:#6b7280;word-break:break-all;">https://inklee.app/onboarding</a></div>',
  text: "Hi {{artist_name}},\n\nYour booking link is close to being usable. A few setup steps are left before clients can send you proper requests.\n\nOnce it is live, a request arrives with placement, size, references, dates and contact info in one place, instead of scattered across DMs.\n\nPick it up where you left off; the remaining steps are short.\n\nFinish setup: https://inklee.app/onboarding",
};
