import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

// FD5 guest buyer identity (wishlist + seller-scoped carts, founder ruling
// 2026-08-01). This product has NO buyer accounts anywhere: `signUp`
// (app/(auth)/signup) only ever creates an ARTIST profile, and a booking
// client's nearest equivalent to "signed in" is holding a valid
// `customer_token_hash` link, which is scoped to one booking, not a
// persistent cross-shop identity. So every cart/wishlist buyer is a guest,
// identified the SAME way `booking_requests` already identifies one: a
// random token the browser holds, only its SHA-256 hash ever stored server
// side. Nothing else is stored — no email, no IP, no name — until an actual
// checkout happens, which is deliberately the smallest shape available (see
// the FD5 decision-log entry for why: GS4, guest-buyer privacy, is already a
// counsel-queue item, and this keeps the cart/wishlist layer off its growth
// path rather than adding a second thing to that queue).
//
// The cookie is httpOnly so page JS can never read or exfiltrate the raw
// token, and every table it authorizes access to has ZERO Postgres policies
// for `anon`/`authenticated` (0141) — access is exclusively through
// `"use server"` actions on the service-role client, which is the only place
// this hash comparison ever happens. Matches the posture 0030 already
// settled for `booking_requests`' customer-token portal: RLS cannot scope a
// policy to "the one row whose hash equals this specific client-supplied
// value" any more safely than not exposing the table to a direct client at
// all.

export const SHOP_GUEST_COOKIE = "inklee_shop_guest";

// 180 days: long enough that a returning buyer's cart/wishlist survives
// between visits (the whole point of persisting it), short enough that an
// abandoned browser profile does not hold an identifier forever.
const COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export function hashGuestToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function mintToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Read-only: for Server Component renders, which cannot set cookies (Next
 * disallows `.set` outside a Server Function / Route Handler — see
 * node_modules/next/dist/docs/.../cookies.md). A first-time visitor has no
 * cookie yet, which is simply "no cart/wishlist", not an error.
 */
export async function readGuestTokenHash(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(SHOP_GUEST_COOKIE)?.value;
  if (!raw) return null;
  return hashGuestToken(raw);
}

/**
 * Read-or-mint: for Server Actions (add to cart / add to wishlist), which
 * CAN set the outgoing cookie. Reuses an existing identity rather than
 * minting a new one on every mutation, so a buyer who already has items
 * doesn't fork into a second, orphaned identity.
 */
export async function getOrCreateGuestTokenHash(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SHOP_GUEST_COOKIE)?.value;
  if (existing) return hashGuestToken(existing);

  const token = mintToken();
  store.set(SHOP_GUEST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return hashGuestToken(token);
}
