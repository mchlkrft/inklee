import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasRedis =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

function makeLimit(
  limiter: Ratelimit["limiter"],
  prefix: string,
): Ratelimit | null {
  if (!hasRedis) return null;
  return new Ratelimit({ redis: Redis.fromEnv(), limiter, prefix });
}

async function check(
  rl: Ratelimit | null,
  key: string,
): Promise<{ allowed: boolean }> {
  if (!rl) {
    if (process.env.NODE_ENV === "production") return { allowed: false };
    return { allowed: true };
  }
  const { success } = await rl.limit(key);
  return { allowed: success };
}

// Public booking form: 5 submissions / artist / IP / hour
const bookingRl = makeLimit(
  Ratelimit.slidingWindow(5, "1 h"),
  "inklee:booking",
);
export async function checkRateLimit(ip: string, artistId?: string) {
  return check(bookingRl, `${artistId ?? "unknown-artist"}:${ip}`);
}

// Waitlist form: 3 submissions / IP / hour
const waitlistRl = makeLimit(
  Ratelimit.slidingWindow(3, "1 h"),
  "inklee:waitlist",
);
export async function checkWaitlistRateLimit(ip: string, artistId?: string) {
  return check(waitlistRl, `${artistId ?? "unknown-artist"}:${ip}`);
}

// Login: 10 attempts / IP / 15 min
const loginRl = makeLimit(Ratelimit.slidingWindow(10, "15 m"), "inklee:login");
export async function checkLoginRateLimit(ip: string) {
  return check(loginRl, ip);
}

// Password reset: 5 / IP / hour, also 5 / email / hour
const passwordResetRl = makeLimit(
  Ratelimit.slidingWindow(5, "1 h"),
  "inklee:pwd-reset",
);
export async function checkPasswordResetRateLimit(key: string) {
  return check(passwordResetRl, key);
}

// Manual reminder send: 3 / artist / booking / reminder-type / day
const reminderRl = makeLimit(
  Ratelimit.slidingWindow(3, "24 h"),
  "inklee:reminder",
);
export async function checkReminderRateLimit(
  artistId: string,
  bookingId: string,
  type: string,
) {
  return check(reminderRl, `${artistId}:${bookingId}:${type}`);
}

// Customer portal actions (reschedule/cancel): 5 / token / hour
const portalRl = makeLimit(Ratelimit.slidingWindow(5, "1 h"), "inklee:portal");
export async function checkPortalRateLimit(tokenHash: string) {
  return check(portalRl, tokenHash);
}

// Mobile-app launch waitlist (/download): 3 submissions / IP / hour.
// Same shape as the artist-side waitlist limit — low ceiling because the
// form is a one-off signup, not a recurring action.
const mobileWaitlistRl = makeLimit(
  Ratelimit.slidingWindow(3, "1 h"),
  "inklee:mobile-waitlist",
);
export async function checkMobileWaitlistRateLimit(ip: string) {
  return check(mobileWaitlistRl, ip);
}
