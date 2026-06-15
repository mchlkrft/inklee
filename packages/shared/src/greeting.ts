// Rotating Home greeting. The pool is shared so web + app speak with one voice;
// each surface passes its own `seed` (web seeds by the day so it rotates ~daily;
// the app seeds per login). Sentence case, no em-dashes, warm but operator-grade.

const WITH_NAME: ((name: string) => string)[] = [
  (n) => `What's up, ${n}?`,
  (n) => `${n} returns.`,
  (n) => `Good to see you, ${n}.`,
  (n) => `Back at it, ${n}.`,
  (n) => `Welcome back, ${n}.`,
  (n) => `Let's get to it, ${n}.`,
  (n) => `Here's your day, ${n}.`,
  (n) => `Hey ${n}, let's make some art.`,
];

const NO_NAME: string[] = [
  "What's up?",
  "Welcome back.",
  "Good to see you.",
  "Back at it.",
  "Let's get to it.",
  "Here's your day.",
];

/**
 * Deterministic rotating greeting. `seed` selects the line so it's stable within
 * a window (web: a day-derived number; app: a per-login number) and fresh the
 * next time. Falls back to a name-less line when the display name is missing.
 */
export function pickGreeting(
  name: string | null | undefined,
  seed: number,
): string {
  const i = Math.abs(Math.trunc(seed));
  const trimmed = (name ?? "").trim();
  if (!trimmed) return NO_NAME[i % NO_NAME.length];
  return WITH_NAME[i % WITH_NAME.length](trimmed);
}
