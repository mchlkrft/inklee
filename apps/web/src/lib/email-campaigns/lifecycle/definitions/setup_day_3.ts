// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "setup_day_3",
  name: "Setup incomplete, day 3",
  status: "draft",
  audienceKey: "setup_incomplete_day_3",
  throttleDays: 1,
  preferenceCategory: "lifecycle",
  subject: "Make your booking link work for you",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">An Inklee link earns its keep once it is somewhere clients actually look: your Instagram bio, a story, a highlight.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Yours is not ready to place yet because setup is unfinished. Complete the booking page and the request form, and you have one clear place to send everyone who asks about appointments.</p><div style="margin-top:20px;"><a href="https://inklee.app/onboarding" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Complete your booking page</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="https://inklee.app/onboarding" style="font-size:12px;color:#6b7280;word-break:break-all;">https://inklee.app/onboarding</a></div>',
  text: "Hi {{artist_name}},\n\nAn Inklee link earns its keep once it is somewhere clients actually look: your Instagram bio, a story, a highlight.\n\nYours is not ready to place yet because setup is unfinished. Complete the booking page and the request form, and you have one clear place to send everyone who asks about appointments.\n\nComplete your booking page: https://inklee.app/onboarding",
};
