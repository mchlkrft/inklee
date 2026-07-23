import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { touchArtistActivity } from "@/lib/growth/activity";

// Slice E1 — auth for the mobile JSON API (`/app/api/mobile/*`). The web app
// uses cookie sessions; the Expo app has no cookie jar, so it sends the Supabase
// access token as `Authorization: Bearer <token>`. We build a per-request
// Supabase client scoped to that token so Row Level Security applies as the
// signed-in artist — exactly like the cookie client, never the service-role key.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type MobileAuth =
  | {
      ok: true;
      userId: string;
      /** The artist's email, for surfaces that notify by email (e.g. support). */
      email: string | null;
      /** Supabase last real sign-in time (not bumped by token refresh) — used to
       *  gate re-auth-sensitive actions like account deletion. */
      lastSignInAt: string | null;
      supabase: SupabaseClient;
    }
  | { ok: false; status: number; error: string };

/** Validate the Bearer token and return an RLS-scoped client for the artist. */
export async function requireMobileUser(req: Request): Promise<MobileAuth> {
  const header = req.headers.get("authorization") ?? "";
  const token = /^bearer\s+/i.test(header)
    ? header.replace(/^bearer\s+/i, "").trim()
    : null;
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token." };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }

  // Suspension / archival gate (BM-2.0 slice 1c). The Supabase auth ban applied
  // when an admin suspends an account is the PRIMARY gate, but it does not
  // necessarily revoke an already-issued access token before it expires; this
  // closes that residual window on the mobile bearer path. Deliberately FAILS
  // OPEN: a missing profile (pre-onboarding) or a read error must not lock out
  // the fleet, because the auth ban remains the real gate. Only an existing row
  // whose status is explicitly not "active" is rejected. Uses maybeSingle so a
  // zero-row read is data:null (not an error) and falls through as allowed.
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile && profile.account_status !== "active") {
    return { ok: false, status: 403, error: "This account is not active." };
  }

  // Growth cockpit day-grain presence (fire-and-forget, debounced to one
  // write per artist per day; failures never affect the request).
  void touchArtistActivity(data.user.id, "mobile");

  return {
    ok: true,
    userId: data.user.id,
    email: data.user.email ?? null,
    lastSignInAt: data.user.last_sign_in_at ?? null,
    supabase,
  };
}

/** Standard success envelope: `{ data }`. */
export function mobileOk(data: unknown): NextResponse {
  return NextResponse.json({ data });
}

/** Standard error envelope: `{ error: { code, message } }`. */
export function mobileError(
  status: number,
  message: string,
  code = "error",
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Map a shared mutation result (`{ success } | { error }` from
 * @/lib/server/bookings) onto an HTTP response. Status is keyed off the
 * structured `errorCode` when the core provides one; the legacy exact-message
 * match is kept as a fallback so cores that haven't adopted codes yet keep
 * their 403/404 behavior. Everything else is a 400 (validation /
 * state-machine guard).
 */
export function mobileMutation(
  result: { error: string; errorCode?: string } | { success: true },
): NextResponse {
  if ("success" in result) return mobileOk({ ok: true });
  const status =
    result.errorCode === "not_found" || result.error === "Booking not found."
      ? 404
      : result.errorCode === "not_authorised" ||
          result.error === "Not authorised."
        ? 403
        : 400;
  return mobileError(status, result.error, result.errorCode ?? "error");
}
