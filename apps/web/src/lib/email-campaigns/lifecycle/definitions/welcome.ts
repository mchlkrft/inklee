// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "welcome",
  name: "Welcome to Inklee",
  status: "active",
  audienceKey: "new_signups",
  throttleDays: 0,
  preferenceCategory: "lifecycle",
  subject: "Welcome to Inklee",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Welcome to Inklee. The idea is simple: instead of chasing placement, size, references and dates through DMs, you get one booking link where clients send complete requests.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">The fastest way to get value out of it is to finish your booking page and request form; if you already have, your link is ready for your Instagram bio, and every &quot;how do I book?&quot; message gets one answer.</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">You can refine everything later. The basics take a few minutes.</p><div style="margin-top:20px;"><a href="https://inklee.app/onboarding" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Finish booking setup</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="https://inklee.app/onboarding" style="font-size:12px;color:#6b7280;word-break:break-all;">https://inklee.app/onboarding</a></div>',
  text: 'Hi {{artist_name}},\n\nWelcome to Inklee. The idea is simple: instead of chasing placement, size, references and dates through DMs, you get one booking link where clients send complete requests.\n\nThe fastest way to get value out of it is to finish your booking page and request form; if you already have, your link is ready for your Instagram bio, and every "how do I book?" message gets one answer.\n\nYou can refine everything later. The basics take a few minutes.\n\nFinish booking setup: https://inklee.app/onboarding',
};
