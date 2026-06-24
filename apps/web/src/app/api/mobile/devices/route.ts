import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

const PLATFORMS = new Set(["ios", "android"]);

// POST /api/mobile/devices  { token, platform, appVersion? } — register/refresh
// this device's Expo push token (upsert on the unique token). Requires migration
// 0046 (device_tokens). The actual push send (E3) needs APNs/FCM via EAS.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: { token?: unknown; platform?: unknown; appVersion?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const platform = typeof body.platform === "string" ? body.platform : "";
  if (!token) return mobileError(400, "Missing push token.");
  if (!PLATFORMS.has(platform)) {
    return mobileError(400, "platform must be 'ios' or 'android'.");
  }

  // MOBILE-01: conflict on (artist_id, token), not the global token, so
  // re-registering by the SAME artist refreshes last_seen while a different
  // artist presenting the same token gets a separate row (no ownership
  // transfer). Migration 0055 backs this with a UNIQUE (artist_id, token).
  const { error } = await supabase.from("device_tokens").upsert(
    {
      artist_id: userId,
      token,
      platform,
      app_version: typeof body.appVersion === "string" ? body.appVersion : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "artist_id,token" },
  );
  if (error) return mobileError(500, error.message);

  return mobileOk({ registered: true });
}

// DELETE /api/mobile/devices?token=… — deregister on sign-out.
export async function DELETE(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return mobileError(400, "Missing token.");

  const { error } = await supabase
    .from("device_tokens")
    .delete()
    .eq("artist_id", userId)
    .eq("token", token);
  if (error) return mobileError(500, error.message);

  return mobileOk({ deregistered: true });
}
