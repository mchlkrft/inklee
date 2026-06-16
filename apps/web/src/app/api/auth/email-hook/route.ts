import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import {
  confirmationEmail,
  passwordResetEmail,
  magicLinkEmail,
  emailChangeEmail,
} from "@/lib/email/auth-templates";

function verifyHookSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  // Standard Webhooks format: secret is "v1,whsec_<base64>"
  const keyBase64 = secret.replace(/^v1,whsec_/, "");
  const key = Buffer.from(keyBase64, "base64");

  const msgId = headers.get("webhook-id") ?? "";
  const msgTimestamp = headers.get("webhook-timestamp") ?? "";
  const msgSignature = headers.get("webhook-signature") ?? "";

  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const computed = createHmac("sha256", key)
    .update(signedContent)
    .digest("base64");

  // webhook-signature may contain multiple sigs: "v1,<sig1> v1,<sig2>"
  return msgSignature.split(" ").some((sig) => {
    const sigValue = sig.replace(/^v1,/, "");
    try {
      return timingSafeEqual(Buffer.from(computed), Buffer.from(sigValue));
    } catch {
      return false;
    }
  });
}

type HookPayload = {
  user: { email: string };
  email_data: {
    token_hash: string;
    redirect_to: string;
    email_action_type:
      | "signup"
      | "recovery"
      | "magiclink"
      | "email_change"
      | "invite";
    site_url: string;
  };
};

function buildConfirmUrl(
  appUrl: string,
  tokenHash: string,
  type: string,
  next: string,
) {
  // Native (mobile) auth passes a custom-scheme deep link (inklee://auth-confirm)
  // as redirect_to. Send the OTP straight to the app so it verifies on-device
  // (the mobile client is PKCE; a web confirm page can't complete the device
  // session). Web auth passes an https URL and routes through /auth/confirm.
  if (/:\/\//.test(next) && !/^https?:\/\//i.test(next)) {
    const sep = next.includes("?") ? "&" : "?";
    return `${next}${sep}token_hash=${encodeURIComponent(
      tokenHash,
    )}&type=${encodeURIComponent(type)}`;
  }
  const url = new URL("/auth/confirm", appUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;

  // Secret must be configured — reject if missing to prevent unauthenticated hook calls
  if (!secret) {
    return NextResponse.json(
      { error: { http_code: 500, message: "hook secret not configured" } },
      { status: 500 },
    );
  }

  if (!verifyHookSignature(rawBody, request.headers, secret)) {
    return NextResponse.json(
      { error: { http_code: 401, message: "unauthorised" } },
      { status: 401 },
    );
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: { http_code: 400, message: "invalid json" } },
      { status: 400 },
    );
  }

  const { user, email_data } = payload;
  const { token_hash, redirect_to, email_action_type, site_url } = email_data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? site_url;
  const to = user.email;

  try {
    switch (email_action_type) {
      case "signup":
      case "invite": {
        const confirmUrl = buildConfirmUrl(
          appUrl,
          token_hash,
          "signup",
          redirect_to || "/onboarding/welcome",
        );
        await sendEmail({
          to,
          subject: "Confirm your Inklee account",
          html: confirmationEmail(confirmUrl),
        });
        break;
      }

      case "recovery": {
        const resetUrl = buildConfirmUrl(
          appUrl,
          token_hash,
          "recovery",
          redirect_to || "/reset-password",
        );
        await sendEmail({
          to,
          subject: "Reset your Inklee password",
          html: passwordResetEmail(resetUrl),
        });
        break;
      }

      case "magiclink": {
        const loginUrl = buildConfirmUrl(
          appUrl,
          token_hash,
          "magiclink",
          redirect_to || "/dashboard",
        );
        await sendEmail({
          to,
          subject: "Your Inklee sign-in link",
          html: magicLinkEmail(loginUrl),
        });
        break;
      }

      case "email_change": {
        const confirmUrl = buildConfirmUrl(
          appUrl,
          token_hash,
          "email_change",
          redirect_to || "/settings/profile",
        );
        await sendEmail({
          to,
          subject: "Confirm your new email address",
          html: emailChangeEmail(confirmUrl),
        });
        break;
      }

      default:
        console.warn("[email-hook] unhandled action type:", email_action_type);
    }
  } catch (err) {
    console.error("[email-hook] send failed:", err);
    return NextResponse.json(
      { error: { http_code: 500, message: "email send failed" } },
      { status: 500 },
    );
  }

  return NextResponse.json({});
}
