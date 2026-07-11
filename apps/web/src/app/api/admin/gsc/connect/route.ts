import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAdminId } from "@/lib/admin-guard";
import { buildAuthUrl, isGscConfigured } from "@/lib/gsc/client";

export const runtime = "nodejs";

// GET /api/admin/gsc/connect — start the Google Search Console OAuth flow.
// Admin-only. CSRF: a random state nonce is stored in a short-lived httpOnly
// cookie and must round-trip through Google unchanged (verified in /callback).
export async function GET(request: Request) {
  const adminId = await getAdminId();
  if (!adminId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isGscConfigured()) {
    const back = new URL(
      "/admin/growth/search?gsc=not-configured",
      request.url,
    );
    return NextResponse.redirect(back);
  }

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(buildAuthUrl(state));
  response.cookies.set("gsc_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/admin/gsc",
  });
  return response;
}
