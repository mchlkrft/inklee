// One source of truth for the onboarding intro "story" slide copy, shared by
// both surfaces (web welcome-slides.tsx, mobile OnboardingIntro.tsx) so the two
// can't drift (ME-10 / ME-12). One entry per slide, zipped by index with the
// illustrations in `@inklee/shared/onboarding-art` (ONBOARDING_ART).
//
// Copy rules (AGENTS.md): sentence case, no em-dashes, US spelling. Slide 2's
// body says "inbox" to match its eyebrow; slide 3 is the feature-expanded copy
// (Link Hub + guest spots + studio management). Action verbs are Accept / Pass.

export type OnboardingIntroSlide = {
  eyebrow: string;
  title: string;
  body: string;
};

export const ONBOARDING_INTRO_SLIDES: OnboardingIntroSlide[] = [
  {
    eyebrow: "Your booking link",
    title: "One link. Every booking.",
    body: "Drop a single Inklee link in your Instagram bio. Clients tap it to start a request. No more booking chaos buried in your DMs.",
  },
  {
    eyebrow: "Your inbox",
    title: "Requests, already sorted.",
    body: "Every client tells you placement, style, size and a reference up front. Each request lands in one tidy inbox, ready to review.",
  },
  {
    eyebrow: "Your studio",
    title: "Run it all in one place.",
    body: "Accept or pass requests with a tap, and bookings land on your calendar. Then build your Link Hub, organize guest spots and manage the rest of your studio.",
  },
];
