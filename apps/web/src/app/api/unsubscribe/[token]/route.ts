// RFC 8058 one-click unsubscribe endpoint. This is the https URI carried in the
// List-Unsubscribe header of marketing/lifecycle campaign mail; List-Unsubscribe-Post:
// List-Unsubscribe=One-Click tells the mail client (Gmail, Apple Mail, ...) to POST here.
//
// It lives at /api/unsubscribe/[token] rather than /unsubscribe/[token] because Next.js App
// Router does not allow a page.tsx and a route.ts on the same segment, and the human-facing
// preference page is a page.tsx. The visible email footer + {{unsubscribe_link}} still point
// at /unsubscribe/[token]; only the machine List-Unsubscribe header points here.
//
// POST opts the token's artist out of all opt-out-able categories and always returns 200
// (never leak whether a token is valid). GET redirects a human who pastes this URL to the
// preference page.
import { NextResponse } from "next/server";
import { lookupUnsubToken } from "@/lib/email-campaigns/unsubscribe-token";
import {
  setEmailPrefs,
  recordUnsubscribeEvent,
} from "@/lib/email-campaigns/preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const found = await lookupUnsubToken(token);
  if (found) {
    const { optedOutNow } = await setEmailPrefs(found.artistId, {
      marketing: false,
      lifecycle: false,
    });
    if (optedOutNow) await recordUnsubscribeEvent();
  }
  // Always 200 regardless of token validity (RFC 8058 one-click).
  return NextResponse.json({ ok: true });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  return NextResponse.redirect(new URL(`/unsubscribe/${token}`, appUrl));
}
