import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";

// Regression suite for the Supabase Send Email Hook (apps/web/src/app/api/auth/
// email-hook/route.ts), the SOLE auth email sender in production
// (mailer_secure_email_change_enabled=true, smtp_host=null). Until commit
// 4833b923 this route had NO test, which is why the bug below shipped.
//
// THE BUG (fixed at 4833b923): with secure (double-confirm) email change,
// Supabase fires this hook ONCE carrying a confirmation token for EACH address
// and requires BOTH to be confirmed. The pre-fix `email_change` case sent
// exactly ONE email, to `user.email` (the CURRENT address), and the HookPayload
// type had no `new_email` / `token_hash_new`. The new-address email was never
// sent, so every email change stalled at email_change_confirm_status=1 and
// could never complete, for ALL users.
//
// FALSIFICATION (pre-registered): the single change that reddens
// "secure email change sends BOTH ..." below is deleting the
// `if (user.new_email && email_data.token_hash_new) { await sendEmail({ to:
// user.new_email, ... }) }` block in route.ts (i.e. reverting to the pre-fix
// behaviour). That drops the call count from 2 to 1 and removes the
// new@example.com recipient, failing the `toHaveBeenCalledTimes(2)` assertion
// and the `to === "new@example.com"` lookup. The two guard cases (signup, and a
// legacy email_change with no new_email) still pass, proving the fix did not
// change the single-recipient flows.

const { mockSendEmail } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
}));

// Mock the mailer so we assert recipients + count without sending. auth-
// templates and the crypto signature check are left REAL: the confirm URL the
// route builds (with the token_hash) is embedded verbatim in the rendered html,
// which is exactly what we assert on, and the HMAC check is the security
// boundary this test must not weaken.
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...a: unknown[]) => mockSendEmail(...a),
}));

import { POST } from "../route";

// The hook secret is Standard Webhooks "v1,whsec_<base64>". The route strips the
// "v1,whsec_" prefix and base64-decodes the remainder to the HMAC key, so we
// derive both from the same key material to produce a genuinely valid signature.
const KEY_MATERIAL = "test-hook-secret-key-material";
const SECRET_KEY_B64 = Buffer.from(KEY_MATERIAL).toString("base64");
const HOOK_SECRET = `v1,whsec_${SECRET_KEY_B64}`;

/**
 * Build a request the route's real verifyHookSignature accepts: a correctly
 * computed HMAC over `${webhook-id}.${webhook-timestamp}.${rawBody}` with a
 * fresh (within 300s) Unix-seconds timestamp. We do NOT weaken the route's
 * check; we satisfy it.
 */
function signedRequest(body: string): NextRequest {
  const msgId = "msg_test_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(SECRET_KEY_B64, "base64");
  const signature = createHmac("sha256", key)
    .update(`${msgId}.${timestamp}.${body}`)
    .digest("base64");
  return new NextRequest("https://inklee.app/api/auth/email-hook", {
    method: "POST",
    body,
    headers: {
      "webhook-id": msgId,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
  process.env.SUPABASE_AUTH_HOOK_SECRET = HOOK_SECRET;
  // Pin appUrl so buildConfirmUrl produces a deterministic absolute URL
  // regardless of ambient env; the token_hash/type params we assert on do not
  // depend on the host, but new URL() needs a valid base.
  process.env.NEXT_PUBLIC_APP_URL = "https://inklee.app";
});

describe("auth email-hook: secure email change (AUTH-EML-001 regression)", () => {
  it("secure email change sends BOTH the current- and new-address confirmations", async () => {
    const body = JSON.stringify({
      user: { email: "old@example.com", new_email: "new@example.com" },
      email_data: {
        token_hash: "CUR",
        token_hash_new: "NEW",
        email_action_type: "email_change",
        redirect_to: "",
        site_url: "https://inklee.app",
      },
    });

    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);

    // The load-bearing assertion. Pre-fix this was ONE call to user.email only,
    // so this line and the new@example.com lookup below both go red when the
    // new-address send is removed from route.ts.
    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    const calls = mockSendEmail.mock.calls.map(
      (c) => c[0] as { to: string; subject: string; html: string },
    );
    const toCurrent = calls.find((a) => a.to === "old@example.com");
    const toNew = calls.find((a) => a.to === "new@example.com");

    expect(toCurrent).toBeDefined();
    expect(toNew).toBeDefined();

    // Current-address confirmation carries token_hash=CUR; new-address carries
    // token_hash=NEW; both are type=email_change; and neither leaks the other's
    // token (a swapped token_hash would confirm the wrong address).
    expect(toCurrent!.html).toContain("token_hash=CUR");
    expect(toCurrent!.html).toContain("type=email_change");
    expect(toCurrent!.html).not.toContain("token_hash=NEW");

    expect(toNew!.html).toContain("token_hash=NEW");
    expect(toNew!.html).toContain("type=email_change");
    expect(toNew!.html).not.toContain("token_hash=CUR");
  });

  // GUARD 1 (non-secure flow unchanged): a signup confirmation is single-
  // recipient. If the fix had widened the two-email behaviour to other action
  // types, this count would be wrong.
  it("a signup confirmation still sends exactly ONE email to user.email", async () => {
    const body = JSON.stringify({
      user: { email: "newuser@example.com" },
      email_data: {
        token_hash: "SIGNUP_TOK",
        email_action_type: "signup",
        redirect_to: "",
        site_url: "https://inklee.app",
      },
    });

    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const arg = mockSendEmail.mock.calls[0][0] as { to: string; html: string };
    expect(arg.to).toBe("newuser@example.com");
    expect(arg.html).toContain("token_hash=SIGNUP_TOK");
    expect(arg.html).toContain("type=signup");
  });

  // GUARD 2 (backward compatibility): an email_change payload WITHOUT
  // new_email/token_hash_new (a non-secure change, or a malformed one) must
  // still send exactly the current-address email and not throw on the missing
  // new-address token. The `if (user.new_email && ...)` guard is what makes this
  // safe.
  it("a legacy email_change with no new_email/token_hash_new sends only the current-address email", async () => {
    const body = JSON.stringify({
      user: { email: "old@example.com" },
      email_data: {
        token_hash: "CUR",
        email_action_type: "email_change",
        redirect_to: "",
        site_url: "https://inklee.app",
      },
    });

    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const arg = mockSendEmail.mock.calls[0][0] as { to: string; html: string };
    expect(arg.to).toBe("old@example.com");
    expect(arg.html).toContain("token_hash=CUR");
  });

  // POSITIVE CONTROL for the signature helper: proves signedRequest() produces
  // genuinely valid signatures (the tests above are not passing because the
  // check is bypassed), and guards the route's HMAC boundary against removal. A
  // bad signature is rejected 401 and sends nothing.
  it("rejects a payload with a bad signature (401) and sends nothing", async () => {
    const body = JSON.stringify({
      user: { email: "old@example.com", new_email: "new@example.com" },
      email_data: {
        token_hash: "CUR",
        token_hash_new: "NEW",
        email_action_type: "email_change",
        redirect_to: "",
        site_url: "https://inklee.app",
      },
    });
    const req = new NextRequest("https://inklee.app/api/auth/email-hook", {
      method: "POST",
      body,
      headers: {
        "webhook-id": "msg_test_1",
        "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "webhook-signature": "v1,not-a-real-signature",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
