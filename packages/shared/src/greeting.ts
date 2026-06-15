// Rotating Home greeting. The pool is shared so web + app speak with one voice;
// each surface passes its own `seed` (web seeds by the day so it rotates ~daily;
// the app seeds per login). Sentence case, no em-dashes; bold, a little cheeky,
// operator-grade. The artist's name is used only every second or third greeting
// (see pickGreeting), so it lands as an occasional personal touch, not a constant.

const WITH_NAME: ((name: string) => string)[] = [
  (n) => `Fresh ink, ${n}?`,
  (n) => `Ready to make something permanent, ${n}?`,
  (n) => `Needles up, ${n}!`,
  (n) => `Back in the chair, ${n}?`,
  (n) => `Another day, another masterpiece, ${n}.`,
  (n) => `Let's turn ideas into ink, ${n}.`,
  (n) => `Your studio awaits, ${n}.`,
  (n) => `Time to leave a mark, ${n}!`,
  (n) => `What are we tattooing today, ${n}?`,
  (n) => `The needle never sleeps, ${n}.`,
  (n) => `Let's make bad ideas look beautiful, ${n}.`,
  (n) => `Your clients are calling, ${n}.`,
  (n) => `Let's cause some tasteful damage, ${n}.`,
  (n) => `Let's keep it bold, ${n}!`,
  (n) => `Good art hurts a little, ${n}.`,
  (n) => `The books won't manage themselves, ${n}.`,
  (n) => `Less scrolling, more tattooing, ${n}.`,
  (n) => `Let's make future grandparents nervous, ${n}.`,
  (n) => `Clean lines. Clear schedule. Let's go, ${n}.`,
  (n) => `Ready to disappoint another mother, ${n}?`,
  (n) => `${n} returns!`,
  (n) => `What's up, ${n}?`,
  (n) => `Back at it, ${n}.`,
  (n) => `Welcome back, ${n}.`,
  (n) => `Let's get to it, ${n}.`,
];

const NO_NAME: string[] = [
  "Fresh ink?",
  "Needles up!",
  "Back in the chair?",
  "Let's turn ideas into ink.",
  "Time to leave a mark!",
  "What are we tattooing today?",
  "The needle never sleeps.",
  "Let's make bad ideas look beautiful.",
  "Let's cause some tasteful damage.",
  "Let's keep it bold!",
  "Good art hurts a little.",
  "Less scrolling, more tattooing.",
  "The books won't manage themselves.",
  "Clean lines. Clear schedule. Let's go.",
  "Ready to make something permanent?",
  "What's up?",
  "Welcome back.",
  "Back at it.",
  "Let's get to it.",
  "Here's your day.",
];

/**
 * Deterministic rotating greeting. `seed` selects the line so it's stable within
 * a window (web: a day-derived number; app: a per-login number) and fresh the
 * next time. The name is used only on seed slots 0 and 2 of each 5 (so the gap
 * between name greetings alternates 2 and 3), keeping the personal touch
 * occasional. A name-less line shows the rest of the time, and always when the
 * display name is missing.
 */
export function pickGreeting(
  name: string | null | undefined,
  seed: number,
): string {
  const i = Math.abs(Math.trunc(seed));
  const trimmed = (name ?? "").trim();
  if (!trimmed) return NO_NAME[i % NO_NAME.length];
  const useName = i % 5 === 0 || i % 5 === 2;
  return useName
    ? WITH_NAME[i % WITH_NAME.length](trimmed)
    : NO_NAME[i % NO_NAME.length];
}
