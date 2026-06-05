import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { writeAudit } from "@/lib/audit";

// Resend webhook signature verification
// Docs: https://resend.com/docs/dashboard/webhooks/introduction
function verifyResendSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const signature = headers.get("svix-signature");
  const msgId = headers.get("svix-id");
  const msgTimestamp = headers.get("svix-timestamp");

  if (!signature || !msgId || !msgTimestamp) return false;

  // Reject timestamps more than 5 minutes old
  const ts = parseInt(msgTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const keyBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const computed = createHmac("sha256", keyBytes)
    .update(signedContent)
    .digest("base64");

  return signature.split(" ").some((sig) => {
    const sigValue = sig.replace(/^v1,/, "");
    try {
      return timingSafeEqual(Buffer.from(computed), Buffer.from(sigValue));
    } catch {
      return false;
    }
  });
}

type ResendEvent = {
  type: string;
  data: {
    email_id?: string;
    to?: string[];
    subject?: string;
    bounce?: { message?: string };
    complaint?: { userAgent?: string };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (secret) {
    if (!verifyResendSignature(rawBody, request.headers, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  } else {
    // Log a warning but process anyway in dev — require in production
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "webhook secret not configured" },
        { status: 500 },
      );
    }
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Only handle delivery failure events in v1
  if (
    event.type === "email.bounced" ||
    event.type === "email.complained" ||
    event.type === "email.delivery_delayed"
  ) {
    void writeAudit({
      action: "email_delivery_failed",
      category: "system",
      details: {
        event_type: event.type,
        email_id: event.data.email_id,
        to: event.data.to?.[0],
        subject: event.data.subject,
        reason: event.data.bounce?.message ?? event.data.complaint?.userAgent,
      },
    });
  }

  return NextResponse.json({ received: true });
}
