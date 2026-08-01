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

// Standalone shop checkout (GC1 C3): 10 checkout starts / artist / IP / hour.
// Its own bucket so a buyer's retries never consume the same IP's booking-form
// budget (and vice versa). Higher than the booking limit because a legitimate
// buyer may bounce off card errors and restart several times.
const shopCheckoutRl = makeLimit(
  Ratelimit.slidingWindow(10, "1 h"),
  "inklee:shop-checkout",
);
export async function checkShopCheckoutRateLimit(ip: string, artistId: string) {
  return check(shopCheckoutRl, `${artistId}:${ip}`);
}

// FD5 cart mutations (add/update/remove): 60 / artist / IP / hour. Its own,
// higher bucket than checkout starts — normal browsing produces many more
// quantity tweaks than actual checkout attempts.
const shopCartRl = makeLimit(
  Ratelimit.slidingWindow(60, "1 h"),
  "inklee:shop-cart",
);
export async function checkShopCartRateLimit(ip: string, artistId: string) {
  return check(shopCartRl, `${artistId}:${ip}`);
}

// FD5 wishlist mutations: cross-artist by design, so keyed by IP alone.
// 60 / IP / hour, same order of magnitude as cart mutations.
const shopWishlistRl = makeLimit(
  Ratelimit.slidingWindow(60, "1 h"),
  "inklee:shop-wishlist",
);
export async function checkShopWishlistRateLimit(ip: string) {
  return check(shopWishlistRl, ip);
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

// Signup: 5 / IP / hour. Signup is a one-off; cap mass account creation and the
// confirmation-email amplification (each attempt can trigger an email), and blunt
// account-existence enumeration via the differing "already exists" response.
const signupRl = makeLimit(Ratelimit.slidingWindow(5, "1 h"), "inklee:signup");
export async function checkSignupRateLimit(ip: string) {
  return check(signupRl, ip);
}

// DSA report submissions (public, unauthenticated): 3 / IP / hour. Each accepted
// call sends two emails (operator + reporter ack) with attacker-supplied text,
// so cap to prevent using it as a mail relay / inbox flood.
const reportRl = makeLimit(Ratelimit.slidingWindow(3, "1 h"), "inklee:report");
export async function checkReportRateLimit(ip: string) {
  return check(reportRl, ip);
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

// Connect KYC submission: 10 / artist / hour. Each call makes 2 Stripe
// round-trips (accounts.update + retrieve), so this throttles an authenticated
// artist hammering the form / amplifying calls to Stripe.
const connectKycRl = makeLimit(
  Ratelimit.slidingWindow(10, "1 h"),
  "inklee:connect-kyc",
);
export async function checkConnectKycRateLimit(userId: string) {
  return check(connectKycRl, userId);
}

// Deposit request: 20 / artist / hour. Each request creates or updates a
// PaymentIntent; the ceiling is generous (an artist legitimately re-requests)
// but caps runaway loops / outbound-Stripe amplification.
const depositRequestRl = makeLimit(
  Ratelimit.slidingWindow(20, "1 h"),
  "inklee:deposit-request",
);
export async function checkDepositRequestRateLimit(userId: string) {
  return check(depositRequestRl, userId);
}

// MFA recovery-code verification: 5 attempts / user / hour. The endpoint
// requires an authenticated (AAL1) session and an 8-char code, so without a cap
// an attacker holding the victim's password could brute-force the code to
// unenroll TOTP and defeat 2FA. Keyed by user id (the session identity) so the
// limit can't be sidestepped by rotating IPs. Fails closed in production if
// Upstash is unconfigured — acceptable for a recovery flow.
const mfaRecoverRl = makeLimit(
  Ratelimit.slidingWindow(5, "1 h"),
  "inklee:mfa-recover",
);
export async function checkMfaRecoverRateLimit(userId: string) {
  return check(mfaRecoverRl, userId);
}

// Public web analytics ingestion: 120 / IP / minute. Generous so real
// multi-tab browsing is never throttled, but caps a single client flooding
// the collector. Keyed on the transient IP (never stored).
const analyticsIngestRl = makeLimit(
  Ratelimit.slidingWindow(120, "1 m"),
  "inklee:wa-ingest",
);
export async function checkAnalyticsIngestRateLimit(ip: string) {
  return check(analyticsIngestRl, ip);
}

// Growth analytics events: 120 / artist / hour, shared by the mobile batch
// endpoint and the web link-copy action. Far above real usage, but caps a
// single account flooding analytics_events (fire-and-forget telemetry writes).
// Keyed by user id so rotating IPs does not sidestep it.
const growthEventsRl = makeLimit(
  Ratelimit.slidingWindow(120, "1 h"),
  "inklee:growth-events",
);
export async function checkGrowthEventsRateLimit(userId: string) {
  return check(growthEventsRl, userId);
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

// Studio claims: 3 submissions / user / day. A claim is a moderation-queue
// item; nobody legitimate files more than a handful.
const claimRl = makeLimit(Ratelimit.slidingWindow(3, "24 h"), "inklee:claim");
export async function checkClaimRateLimit(userId: string) {
  return check(claimRl, userId);
}

// Guest spot requests: 5 submissions / artist / day. Each is a studio-inbox
// item; the ceiling covers a real multi-city planning session.
const guestSpotRl = makeLimit(
  Ratelimit.slidingWindow(5, "24 h"),
  "inklee:guest-spot",
);
export async function checkGuestSpotRequestRateLimit(userId: string) {
  return check(guestSpotRl, userId);
}

// Public map data plane (go-live plan S1): per-IP ceilings on the anonymous
// branches of /api/map/*. CDN cache hits never reach the function, so the
// limiter only sees misses. Pins is generous (pans are debounced 300 ms, so
// even sustained panning stays under it), detail is per click, and search is
// the tightest because it fires per keystroke. Fails closed in production
// when Upstash is unconfigured, the same posture as every public form. The
// authed branches stay unlimited, exactly as before.
const publicMapPinsRl = makeLimit(
  Ratelimit.slidingWindow(240, "1 m"),
  "inklee:map-public-pins",
);
export async function checkPublicMapPinsRateLimit(ip: string) {
  return check(publicMapPinsRl, ip);
}

const publicMapDetailRl = makeLimit(
  Ratelimit.slidingWindow(60, "1 m"),
  "inklee:map-public-detail",
);
export async function checkPublicMapDetailRateLimit(ip: string) {
  return check(publicMapDetailRl, ip);
}

const publicMapSearchRl = makeLimit(
  Ratelimit.slidingWindow(45, "1 m"),
  "inklee:map-public-search",
);
export async function checkPublicMapSearchRateLimit(ip: string) {
  return check(publicMapSearchRl, ip);
}

// Gallery "Import from URL" (founder ruling FD4, 2026-08-01): 20 / artist /
// hour. Unlike a direct upload, this call makes an OUTBOUND server-side fetch
// to an artist-supplied, otherwise-arbitrary host (egress cost + SSRF-guard
// work on every attempt), so it gets its own bucket rather than riding the
// upload path's implicit no-limit. Per-user, no IP needed (an authenticated
// Server Action, same shape as checkConnectKycRateLimit/
// checkDepositRequestRateLimit): 20/h is generous for a real import session
// (a dozen images from a portfolio site) while bounding how much outbound-
// fetch amplification one account can trigger.
const galleryImportRl = makeLimit(
  Ratelimit.slidingWindow(20, "1 h"),
  "inklee:gallery-import",
);
export async function checkGalleryImportRateLimit(userId: string) {
  return check(galleryImportRl, userId);
}

// Studio media proxy (go-live plan S2b): image fan-out, so the ceiling is far
// above the detail budget. One studio page can request a logo plus a dozen
// photos, and browsers parallelize them; CDN hits never reach the function,
// so this only meters misses and enumeration attempts.
const studioMediaRl = makeLimit(
  Ratelimit.slidingWindow(300, "1 m"),
  "inklee:studio-media",
);
export async function checkStudioMediaRateLimit(ip: string) {
  return check(studioMediaRl, ip);
}
