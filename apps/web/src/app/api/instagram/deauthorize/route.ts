import { NextResponse } from "next/server";
import { parseSignedRequest } from "@/lib/instagram";
import { disconnectByInstagramUserId } from "@/lib/server/instagram-sync";

export const runtime = "nodejs";
// Teardown purges cached thumbnails from storage; default 10s could clip it.
export const maxDuration = 60;

// POST /api/instagram/deauthorize — Meta calls this when an artist removes
// Inklee from their Instagram account (form-encoded `signed_request`, HMAC
// verified in parseSignedRequest). Runs the same full teardown as the in-app
// disconnect. Idempotent; unauthenticated by design (the HMAC is the auth).
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string" || !signedRequest) {
    return NextResponse.json(
      { error: "missing signed_request" },
      { status: 400 },
    );
  }

  const payload = parseSignedRequest(signedRequest);
  if (!payload?.user_id) {
    return NextResponse.json(
      { error: "invalid signed_request" },
      { status: 400 },
    );
  }

  const removed = await disconnectByInstagramUserId(payload.user_id);
  if (removed === 0) {
    // Legit after a deauthorize-then-deletion sequence, but also the signature
    // of an unmatched id (e.g. a pre-0061 row without app_scoped_user_id) —
    // keep it at warn level so a missed teardown is visible in the logs.
    console.warn(
      `[instagram/deauthorize] ig user ${payload.user_id}: no matching account`,
    );
  } else {
    console.log(
      `[instagram/deauthorize] ig user ${payload.user_id}: ${removed} account(s) torn down`,
    );
  }
  return NextResponse.json({ success: true });
}
