"use server";

import { serviceClient } from "@/lib/supabase/service";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/ratelimit";
import { todayInTimeZone } from "@/lib/date-utils";
import { sendBookingEmail } from "@/lib/email/send-booking-email";
import { createNotification } from "@/lib/notifications";
import { customerLabel } from "@/lib/booking-domain";
import {
  computeFlashAvailability,
  FLASH_ACTIVE_REQUEST_STATUSES,
} from "@/lib/flash";
import { HONEYPOT_FIELD, isHoneypotTriggered } from "@/lib/honeypot";
import { isAllowedBookingOrigin } from "@/lib/host";
import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

const flashBookingSchema = z.object({
  // Instagram is optional; email is always required (Inklee runs over email).
  instagram_handle: z.string().transform((s) => s.replace(/^@/, "").trim()),
  email: z.string().email("valid email required"),
  placement: z.string().min(1, "placement is required").max(200),
  preferred_date: z.string().min(1, "preferred date is required"),
  notes: z.string().max(500).optional(),
});

type State = { error: string; field?: string } | null;

export async function submitFlashBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  // Honeypot — silently succeed so bots don't know they were blocked.
  if (isHoneypotTriggered(formData.get(HONEYPOT_FIELD))) return null;

  // Origin check — accepts the app host and artist bio-domain subdomains (the
  // form is served on both), so flash bookings keep working under *.inkl.ee.
  const headersList = await headers();
  if (
    !isAllowedBookingOrigin(
      headersList.get("origin"),
      process.env.NEXT_PUBLIC_APP_URL,
    )
  ) {
    return { error: "invalid request origin" };
  }

  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Validate form fields
  const raw = {
    instagram_handle: (formData.get("instagram_handle") as string) ?? "",
    email: (formData.get("email") as string) ?? "",
    placement: formData.get("placement"),
    preferred_date: formData.get("preferred_date"),
    notes: formData.get("notes"),
  };

  const parsed = flashBookingSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first.message, field: first.path[0] as string };
  }
  const data = parsed.data;

  const flashItemId = formData.get("flash_item_id") as string;
  const flashDayId = (formData.get("flash_day_id") as string) || null;
  const artistSlug = formData.get("artist_slug") as string;

  // Look up artist
  const { data: artistProfile } = await serviceClient
    .from("profiles")
    .select("id, display_name, timezone")
    .eq("slug", artistSlug)
    .single();
  if (!artistProfile) return { error: "artist not found" };
  const artistId = artistProfile.id;

  const { allowed } = await checkRateLimit(ip, artistId);
  if (!allowed) {
    return { error: "Too many requests. Please wait before submitting again." };
  }

  if (
    data.preferred_date <=
    todayInTimeZone(artistProfile.timezone ?? "Europe/Berlin")
  ) {
    return {
      error: "preferred date must be a future date",
      field: "preferred_date",
    };
  }

  // Fetch flash item and check ownership
  const { data: flashItem } = await serviceClient
    .from("flash_items")
    .select("*")
    .eq("id", flashItemId)
    .eq("artist_id", artistId)
    .single();

  if (!flashItem) return { error: "flash item not found" };

  // Attribution guard: flash_day_id arrives from a client field, so only record
  // it if this design is actually a member of that day; otherwise drop it.
  let attributedDayId: string | null = null;
  if (flashDayId) {
    const { data: membership } = await serviceClient
      .from("flash_day_items")
      .select("day_id")
      .eq("day_id", flashDayId)
      .eq("item_id", flashItemId)
      .eq("artist_id", artistId)
      .maybeSingle();
    attributedDayId = membership ? flashDayId : null;
  }

  // Count active requests for this item so unique/limited flash cannot collect
  // more pending requests than its intake capacity.
  const { count: activeRequestCount } = await serviceClient
    .from("booking_requests")
    .select("*", { count: "exact", head: true })
    .eq("flash_item_id", flashItemId)
    .in("status", [...FLASH_ACTIVE_REQUEST_STATUSES]);

  const availability = computeFlashAvailability(
    flashItem,
    activeRequestCount ?? 0,
  );

  if (!availability.bookable) {
    return { error: "this flash item is no longer available for booking" };
  }

  // Deduplication: same email + same flash item within 60s. Email is always
  // required now, so this guard always runs.
  if (data.email) {
    const dedupeWindow = new Date(Date.now() - 60000).toISOString();
    const { count: recentCount } = await serviceClient
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId)
      .eq("flash_item_id", flashItemId)
      .eq("customer_email", data.email)
      .gte("created_at", dedupeWindow);

    if ((recentCount ?? 0) > 0) {
      return {
        error:
          "Your request was already submitted. Check your email for confirmation.",
      };
    }
  }

  // Insert booking. PUB-3: the count check above is optimistic (for the fast
  // "no longer available" path + specific reasons); the authoritative capacity
  // enforcement happens inside book_flash_item, which locks the flash item and
  // re-checks the cap in the SAME transaction as the insert, so two concurrent
  // clients can't both slip past a unique/limited cap. A NULL return means the
  // design filled between the optimistic check and here.
  const bookingId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const { data: insertedId, error: insertError } = await serviceClient.rpc(
    "book_flash_item",
    {
      p_flash_item_id: flashItemId,
      p_artist_id: artistId,
      p_booking_id: bookingId,
      p_form_data: {
        instagram_handle: data.instagram_handle,
        placement: data.placement,
        notes: data.notes || null,
        flash_item_title: flashItem.title,
        flash_item_slug: flashItem.slug,
      },
      p_preferred_date: data.preferred_date,
      p_customer_email: data.email || null,
      p_customer_handle: data.instagram_handle || null,
      p_customer_token_hash: data.email ? tokenHash : null,
      p_flash_day_id: attributedDayId,
    },
  );

  if (insertError) {
    Sentry.captureException(insertError, {
      tags: { action: "flash_booking_insert" },
    });
    return { error: "Something went wrong. Try again." };
  }

  if (!insertedId) {
    // Lost the capacity race (or the item is no longer bookable).
    return { error: "this flash item is no longer available for booking" };
  }

  // Audit log
  await serviceClient.from("audit_log").insert({
    booking_id: bookingId,
    action: "booking_created",
    details: { origin: "flash_form", flash_item_id: flashItemId, ip },
  });

  // Notify artist
  const notificationResult = await createNotification({
    artistId,
    type: "booking_request",
    category: "booking_activity",
    priority: "high",
    title: "New flash booking request",
    message: `${customerLabel(data.instagram_handle, data.email)} wants to book "${flashItem.title}"`,
    ctaLabel: "View request",
    ctaHref: `/bookings/requests/${bookingId}`,
    metadata: { booking_id: bookingId, flash_item_id: flashItemId },
  });
  if (!notificationResult.ok) {
    console.error("[flash-booking] notification failed", {
      artistId,
      bookingId,
      error: notificationResult.error,
    });
  }

  // Send confirmation email using existing booking email system
  const magicLinkBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const magicLink = `${magicLinkBase}/request/${token}`;

  if (data.email) {
    try {
      await sendBookingEmail({
        type: "customer_booking_submitted",
        to: data.email,
        artistId,
        vars: {
          customer_handle: data.instagram_handle,
          artist_name: artistProfile.display_name,
          artist_slug: artistSlug,
          placement: `${flashItem.title}, ${data.placement}`,
          size: flashItem.size_info ?? "-",
          date: data.preferred_date,
          magic_link: magicLink,
        },
      });
    } catch (e) {
      Sentry.captureException(e, { tags: { action: "flash_email_send" } });
    }
  }

  redirect(
    `/request/submitted?id=${bookingId}&slug=${artistSlug}&email=${data.email ? "1" : "0"}`,
  );
}
