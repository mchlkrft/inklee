// Lifecycle definition: one-time nudge for artists who signed up but never finished
// onboarding. Ships as 'draft' — it never runs until deliberately flipped to 'active'
// (and EMAIL_LIFECYCLE_ENABLED is 'true'). The filename is the definition key and the
// export is named `definition` — Control Tower's export workflow relies on both.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "setup_incomplete_nudge",
  name: "Setup incomplete nudge",
  status: "draft",
  audienceKey: "setup_incomplete",
  throttleDays: 7,
  preferenceCategory: "lifecycle",
  subject: "Finish setting up your Inklee page",
  html: [
    "<p>Hi {{artist_name}},</p>",
    "<p>Your Inklee page is almost ready. Once setup is complete, clients can find your page and send booking requests.</p>",
    '<p>It usually takes a few minutes: <a href="https://inklee.app/onboarding">finish your setup</a>.</p>',
    "<p>Stuck on a step? Just reply to this email.</p>",
  ].join("\n"),
  text: [
    "Hi {{artist_name}},",
    "",
    "Your Inklee page is almost ready. Once setup is complete, clients can find your page and send booking requests.",
    "",
    "It usually takes a few minutes: https://inklee.app/onboarding",
    "",
    "Stuck on a step? Just reply to this email.",
  ].join("\n"),
};
