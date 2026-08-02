import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { buildEmailHtml } from "@/lib/email/booking-templates";
import {
  galleryCurrentlyEntitled,
  relocateArtistGallery,
} from "@/lib/server/gallery-relocation";
import type { AccountOverrides } from "@/lib/entitlements";

const WARNING_DAYS = 14;

export type CompExpirySweepResult = {
  warningsSent: number;
  expiredNotified: number;
  errors: number;
};

export async function runCompExpirySweep(): Promise<CompExpirySweepResult> {
  const result: CompExpirySweepResult = {
    warningsSent: 0,
    expiredNotified: 0,
    errors: 0,
  };

  const now = new Date();
  const warningCutoff = new Date(
    now.getTime() + WARNING_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: comps, error: fetchErr } = await serviceClient
    .from("account_overrides")
    .select(
      "artist_id, plan_tier, plan_source, plan_expires_at, entitlement_overrides, gallery_relocated_at",
    )
    .eq("plan_tier", "plus")
    .not("plan_expires_at", "is", null)
    .lte("plan_expires_at", warningCutoff);

  if (fetchErr) {
    Sentry.captureException(fetchErr, {
      tags: { action: "comp_expiry_sweep" },
    });
    return result;
  }
  if (!comps || comps.length === 0) return result;

  for (const comp of comps) {
    const expiresAt = new Date(comp.plan_expires_at as string);
    const expired = expiresAt.getTime() <= now.getTime();
    const noticeKind = expired ? "expired" : "warning";
    const idempotencyKey = `comp_${noticeKind}_${(comp.plan_expires_at as string).slice(0, 7)}`;

    try {
      const { count } = await serviceClient
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("artist_id", comp.artist_id)
        .eq("type", "info")
        .contains("metadata", { compExpiryKey: idempotencyKey });

      if ((count ?? 0) > 0) continue;

      const expiryDate = expiresAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      if (expired) {
        await notifyExpired(
          comp.artist_id as string,
          expiryDate,
          idempotencyKey,
        );
        result.expiredNotified++;

        // Gallery relocation (counsel C1.5). Gated behind the SAME
        // once-per-lapse idempotency key as the notification above (the
        // `count > 0` continue guards this whole branch), and additionally
        // checked against the live entitlement oracle so a per-account
        // override granting this artist the gallery feature despite an
        // expired comp is honoured rather than wrongly relocated. Already
        // archived (a retry landing here somehow) is a no-op inside
        // relocateArtistGallery; failures are Sentry-reported there and
        // left for the nightly sweep, never thrown into this loop.
        const entitled = galleryCurrentlyEntitled({
          planTier: comp.plan_tier as AccountOverrides["planTier"],
          planExpiresAt: comp.plan_expires_at as string | null,
          entitlementOverrides:
            (comp.entitlement_overrides as
              | AccountOverrides["entitlementOverrides"]
              | null) ?? {},
        });
        if (!entitled) {
          await relocateArtistGallery(comp.artist_id as string);
        }
      } else {
        await notifyWarning(
          comp.artist_id as string,
          expiryDate,
          idempotencyKey,
        );
        result.warningsSent++;
      }
    } catch (e) {
      Sentry.captureException(e, {
        tags: { action: "comp_expiry_sweep" },
        extra: { artistId: comp.artist_id, noticeKind },
      });
      result.errors++;
    }
  }

  return result;
}

async function notifyWarning(
  artistId: string,
  expiryDate: string,
  idempotencyKey: string,
) {
  await createNotification({
    artistId,
    type: "info",
    category: "info",
    priority: "medium",
    title: "Plus access ending soon",
    message: `Your complimentary Plus access expires on ${expiryDate}. Subscribe to keep your Plus features.`,
    ctaLabel: "View plans",
    ctaHref: "/settings/plan",
    metadata: { compExpiryKey: idempotencyKey },
  });

  await sendCompEmail(artistId, {
    subject: "Your Inklee Plus access ends soon",
    body: [
      `Your complimentary Inklee Plus access expires on ${expiryDate}.`,
      "After that, your account returns to the free plan. Card deposit collection and other Plus features will no longer be available.",
      "All your data and settings are preserved. You can keep Plus by subscribing any time before or after the expiry date.",
    ].join("\n\n"),
  });
}

async function notifyExpired(
  artistId: string,
  expiryDate: string,
  idempotencyKey: string,
) {
  await createNotification({
    artistId,
    type: "info",
    category: "system_warning",
    priority: "high",
    title: "Plus access has ended",
    message:
      "Your complimentary Plus access has expired. Your account is now on the free plan.",
    ctaLabel: "View plans",
    ctaHref: "/settings/plan",
    metadata: { compExpiryKey: idempotencyKey },
  });

  await sendCompEmail(artistId, {
    subject: "Your Inklee Plus access has ended",
    body: [
      "Your complimentary Inklee Plus access has expired. Your account is now on the free plan.",
      "All your data, bookings, and settings are preserved. Card deposit collection and other Plus features are paused until you subscribe.",
      "You can re-enable Plus features any time from your account settings.",
    ].join("\n\n"),
  });
}

async function sendCompEmail(
  artistId: string,
  content: { subject: string; body: string },
) {
  const { data: userData } =
    await serviceClient.auth.admin.getUserById(artistId);
  const email = userData?.user?.email;
  if (!email) return;

  await sendEmail({
    to: email,
    subject: content.subject,
    html: buildEmailHtml(content.body, {}, undefined, {
      footerNote: "Sent by Inklee about your account.",
    }),
  });
}
