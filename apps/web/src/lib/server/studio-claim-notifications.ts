import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { escapeHtml, renderEmailShell } from "@/lib/email/layout";

// Claim approval is the one genuinely celebratory moment in the studio
// lifecycle: an artist asked for a place on the map and a human said yes.
// Until now it landed silently, so the claimant only found out by going back
// to look. This mirrors the guest spot wiring: one in-app feed row (push rides
// along inside createNotification) plus one transactional email, nothing
// chattier.
//
// Best-effort by construction, exactly like the guest spot notifier: a claim
// approval is a money-adjacent state change that has ALREADY been committed by
// the time we get here, so a mail or feed failure must never surface as a
// failed approval and tempt an admin into approving twice.

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

async function emailFor(userId: string): Promise<string | null> {
  try {
    const { data } = await serviceClient.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Tell a claimant their studio is theirs. Called after the approval is
 * committed; never throws.
 */
export async function notifyClaimApproved(input: {
  claimantId: string;
  studioName: string;
}): Promise<void> {
  const { claimantId, studioName } = input;
  const name = studioName.trim() || "Your studio";

  try {
    await createNotification({
      artistId: claimantId,
      type: "studio_claim_approved",
      category: "info",
      priority: "high",
      title: "Your studio is confirmed",
      message: `${name} is now linked to your account. Add your details and publish when you are ready.`,
      ctaLabel: "Open your studio",
      ctaHref: "/studio",
      metadata: { studio_name: name },
    });
  } catch (err) {
    console.error("[studio-claim] notification failed:", err);
  }

  try {
    const to = await emailFor(claimantId);
    if (!to) return;
    const lines = [
      `Congratulations. ${name} is yours.`,
      "We checked your claim and it is approved, so the studio is now linked to your account.",
      "Add your details, styles and house rules, then publish when you are ready. You can also tell artists whether you are open to guest spots.",
    ];
    const body = lines
      .map((l) => `<p style="margin:0 0 12px 0;">${escapeHtml(l)}</p>`)
      .join("");
    const button = `<p style="margin:20px 0 0 0;"><a href="${APP_ORIGIN}/studio" style="display:inline-block;background:#1e1e1e;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;">Open your studio</a></p>`;
    await sendEmail({
      to,
      subject: `${name} is yours`,
      html: renderEmailShell({ contentHtml: body + button }),
    });
  } catch (err) {
    console.error("[studio-claim] email failed:", err);
  }
}
