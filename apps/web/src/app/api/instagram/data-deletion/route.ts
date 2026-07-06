import crypto from "crypto";
import { NextResponse } from "next/server";
import { parseSignedRequest } from "@/lib/instagram";
import { disconnectByInstagramUserId } from "@/lib/server/instagram-sync";

export const runtime = "nodejs";
// Teardown purges cached thumbnails from storage; default 10s could clip it.
export const maxDuration = 60;

// POST /api/instagram/data-deletion — Meta's data-deletion request callback
// (form-encoded `signed_request`, HMAC verified in parseSignedRequest). The
// deletion is synchronous: the same full teardown as the in-app disconnect.
// Meta requires the response `{ url, confirmation_code }`, where `url` is a
// human-readable status page. The confirmation code is a deterministic digest
// of the Instagram user id so Meta's retries resolve to the same code; it
// carries no PII and grants nothing.
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
      `[instagram/data-deletion] ig user ${payload.user_id}: no matching account`,
    );
  } else {
    console.log(
      `[instagram/data-deletion] ig user ${payload.user_id}: ${removed} account(s) torn down`,
    );
  }

  const confirmationCode = `ig-${crypto
    .createHash("sha256")
    .update(payload.user_id)
    .digest("hex")
    .slice(0, 12)}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  return NextResponse.json({
    url: `${appUrl}/instagram/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
