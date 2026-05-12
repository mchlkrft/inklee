"use server";

import { serviceClient } from "@/lib/supabase/service";
import { bookingSchema } from "@/lib/booking-schema";
import { checkRateLimit, checkWaitlistRateLimit } from "@/lib/ratelimit";
import {
  sendBookingEmail,
  sendWaitlistConfirmation,
} from "@/lib/email/send-booking-email";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { validateCustomAnswers } from "@/lib/custom-fields";
import { createNotification } from "@/lib/notifications";
import type { CustomFieldDef, CustomAnswerSnapshot } from "@/lib/custom-fields";
import { parseBooksSettings } from "@/lib/books-settings";
import { parseFormSettings } from "@/lib/form-settings";
import { processImage } from "@/lib/image-processing";
import {
  buildBookingFingerprintKey,
  bookingModeFromRequest,
  normalizeBookingMode,
} from "@/lib/booking-domain";
import {
  dateKeyInTimeZone,
  isDateKeyBefore,
  isDateKeyOnOrBefore,
  todayInTimeZone,
} from "@/lib/date-utils";
import { HONEYPOT_FIELD, isHoneypotTriggered } from "@/lib/honeypot";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB raw input limit
const MAX_IMAGES = 5;

type State = { error: string; field?: string } | null;

export async function submitBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  // Honeypot check — silently succeed so bots don't know they were blocked.
  // Tightened: only treat URL-shaped or very long fills as bot signal so
  // browser autofill writing into the hidden field doesn't false-positive.
  if (isHoneypotTriggered(formData.get(HONEYPOT_FIELD))) return null;

  // Origin check — reject submissions from unexpected domains
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (appUrl && origin && origin !== appUrl) {
    return { error: "invalid request origin" };
  }

  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Load artist profile first — needed for settings, booking mode, and timezone.
  const artistSlug = formData.get("artist_slug") as string;
  const { data: artistProfile } = await serviceClient
    .from("profiles")
    .select("id, display_name, settings, booking_mode, timezone")
    .eq("slug", artistSlug)
    .single();

  if (!artistProfile) return { error: "artist not found" };
  const artistId = artistProfile.id;
  const artistName = artistProfile.display_name;
  const artistBookingMode = normalizeBookingMode(artistProfile.booking_mode);
  const artistTimeZone = artistProfile.timezone ?? "Europe/Berlin";

  const { allowed } = await checkRateLimit(ip, artistId);
  if (!allowed) {
    return { error: "too many requests — please wait before submitting again" };
  }

  const profileSettings = (artistProfile.settings ?? {}) as Record<
    string,
    unknown
  >;
  const formSettings = parseFormSettings(profileSettings.form_settings);

  // Core form validation — null → "" for fields that may be hidden
  const raw = {
    instagram_handle: (formData.get("instagram_handle") as string) ?? "",
    email: (formData.get("email") as string) ?? "",
    reference_link: formData.get("reference_link"),
    placement: (formData.get("placement") as string) ?? "",
    size: (formData.get("size") as string) ?? "",
    description: (formData.get("description") as string) ?? "",
    preferred_date: (formData.get("preferred_date") as string) ?? "",
  };

  // Presence checks — only enforce optional fields when the artist has enabled them.
  if (formSettings.show_instagram_handle && !raw.instagram_handle) {
    return { error: "instagram handle is required", field: "instagram_handle" };
  }
  if (formSettings.show_email && !raw.email) {
    return { error: "valid email required", field: "email" };
  }
  if (formSettings.show_placement && !raw.placement) {
    return { error: "placement is required", field: "placement" };
  }
  if (formSettings.show_size && !raw.size) {
    return { error: "please select a size", field: "size" };
  }
  if (artistBookingMode === "preferred_date" && !raw.preferred_date) {
    return { error: "preferred date is required", field: "preferred_date" };
  }
  if (!raw.description && formSettings.require_description) {
    return { error: "description is required", field: "description" };
  }

  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first.message, field: first.path[0] as string };
  }

  const data = parsed.data;

  if (artistBookingMode === "preferred_date" && data.preferred_date) {
    if (
      isDateKeyOnOrBefore(data.preferred_date, todayInTimeZone(artistTimeZone))
    ) {
      return {
        error: "preferred date must be a future date",
        field: "preferred_date",
      };
    }
  }

  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(
      booksSettings.booking_window_ends_at,
      todayInTimeZone(artistTimeZone),
    );
  if (!booksSettings.books_open || windowExpired) {
    return { error: "booking requests are currently closed" };
  }
  if (booksSettings.booking_cap !== null) {
    const { count } = await serviceClient
      .from("booking_requests")
      .select("*", { count: "exact", head: true })
      .eq("artist_id", artistId)
      .in("status", ["pending", "approved", "deposit_pending"]);
    if ((count ?? 0) >= booksSettings.booking_cap) {
      return { error: "this round of bookings is full" };
    }
  }

  // Fetch active custom fields and validate submitted answers
  let customAnswers: CustomAnswerSnapshot[] = [];
  {
    const { data: activeFields } = await serviceClient
      .from("custom_fields")
      .select("*")
      .eq("artist_id", artistId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("position");

    const fields = (activeFields as CustomFieldDef[]) ?? [];
    const rawCustom: Record<string, string> = {};
    for (const field of fields) {
      const val = formData.get(`cf_${field.key}`);
      if (val !== null) rawCustom[field.key] = val as string;
    }

    const result = validateCustomAnswers(rawCustom, fields);
    if (!result.ok) return { error: result.error, field: result.field };
    customAnswers = result.answers;
  }

  // Validate images
  const imageFiles = formData.getAll("images") as File[];
  const realImages = imageFiles.filter((f) => f.size > 0);

  if (realImages.length > MAX_IMAGES) {
    return { error: `maximum ${MAX_IMAGES} images` };
  }
  for (const file of realImages) {
    if (file.size > MAX_IMAGE_SIZE)
      return { error: "each image must be under 10mb" };
    if (!ALLOWED_IMAGE_TYPES.includes(file.type))
      return { error: "images must be jpg, png, or webp" };
  }

  const tripId = (formData.get("trip_id") as string) || null;
  const requestedSlotId =
    artistBookingMode === "fixed_slots"
      ? (formData.get("slot_id") as string) || null
      : null;

  // Validate trip ownership and that the selected trip still has future coverage.
  if (tripId && data.preferred_date && artistBookingMode !== "fixed_slots") {
    const { data: tripOwner } = await serviceClient
      .from("trips")
      .select("artist_id, show_on_booking_form")
      .eq("id", tripId)
      .single();

    if (
      !tripOwner ||
      tripOwner.artist_id !== artistId ||
      !tripOwner.show_on_booking_form
    ) {
      return { error: "invalid location selection" };
    }

    const { data: tripLegs } = await serviceClient
      .from("trip_legs")
      .select("starts_on, ends_on")
      .eq("trip_id", tripId);

    const tripHasMatchingLeg = (tripLegs ?? []).some(
      (leg) =>
        leg.starts_on <= data.preferred_date &&
        leg.ends_on >= data.preferred_date,
    );

    if (!tripHasMatchingLeg) {
      return {
        error: "the selected location is not available on that date",
        field: "preferred_date",
      };
    }
  }

  const bookingId = crypto.randomUUID();

  // Deduplication: compare a request fingerprint instead of email only.
  const dedupeWindow = new Date(Date.now() - 60000).toISOString();
  const requestFingerprint = buildBookingFingerprintKey({
    bookingMode: artistBookingMode,
    customerEmail: data.email || null,
    customerHandle: data.instagram_handle || null,
    preferredDate: data.preferred_date || null,
    slotId: requestedSlotId,
    tripId,
    placement: data.placement || null,
    size: data.size || null,
  });
  const { data: recentBookings } = await serviceClient
    .from("booking_requests")
    .select(
      "customer_email, customer_handle, preferred_date, slot_id, trip_id, flash_item_id, form_data",
    )
    .eq("artist_id", artistId)
    .gte("created_at", dedupeWindow);

  const duplicate = (recentBookings ?? []).some((row) => {
    const fd = row.form_data as Record<string, unknown> | null;
    return (
      buildBookingFingerprintKey({
        bookingMode: bookingModeFromRequest(row),
        customerEmail: row.customer_email,
        customerHandle: row.customer_handle,
        preferredDate: row.preferred_date,
        slotId: row.slot_id,
        tripId: row.trip_id,
        flashItemId: row.flash_item_id,
        placement: typeof fd?.placement === "string" ? fd.placement : null,
        size: typeof fd?.size === "string" ? fd.size : null,
      }) === requestFingerprint
    );
  });

  if (duplicate) {
    return {
      error: data.email
        ? "your request was already submitted — check your email for confirmation"
        : "this request was already submitted very recently",
    };
  }

  // Slot mode: atomically lock the slot before proceeding.
  let slotId: string | null = null;
  let slotDate: string | null = null;
  if (artistBookingMode === "fixed_slots") {
    if (!requestedSlotId)
      return { error: "please select a slot", field: "slot_id" };

    // Service-role atomic lock. The .eq("status", "open") WHERE clause is the
    // concurrency guard — two concurrent submissions still race correctly at
    // the SQL level. Service role is needed because the SELECT after UPDATE
    // returns a row with status='locked', which the public anon SELECT policy
    // (status='open' only) would hide, making the lock appear to fail.
    const { data: locked } = await serviceClient
      .from("slots")
      .update({ status: "locked" })
      .eq("id", requestedSlotId)
      .eq("status", "open")
      .select("id, starts_at")
      .single();

    if (!locked) {
      return {
        error: "this slot is no longer available — please choose another",
        field: "slot_id",
      };
    }
    slotId = locked.id;
    slotDate = dateKeyInTimeZone(locked.starts_at, artistTimeZone);
  }

  // Process and upload images — resize/compress to WebP before storage
  type UploadedImage = {
    path: string;
    originalFilename: string;
    mimeType: string;
    width: number;
    height: number;
    fileSize: number;
  };
  const uploadedImages: UploadedImage[] = [];

  for (const file of realImages) {
    const path = `${artistId}/${bookingId}/${crypto.randomUUID()}.webp`;
    let processed;
    try {
      processed = await processImage(file);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { action: "booking_image_process" },
        extra: { bookingId, filename: file.name, size: file.size },
      });
      if (uploadedImages.length > 0) {
        await serviceClient.storage
          .from("bookings")
          .remove(uploadedImages.map((u) => u.path));
      }
      return { error: "image processing failed — try a different file" };
    }

    try {
      const { error: uploadError } = await serviceClient.storage
        .from("bookings")
        .upload(path, processed.buffer, { contentType: "image/webp" });

      if (uploadError) {
        Sentry.captureMessage("booking image upload failed", {
          level: "error",
          tags: { action: "booking_upload" },
          extra: { bookingId, path, message: uploadError.message },
        });
        if (uploadedImages.length > 0) {
          await serviceClient.storage
            .from("bookings")
            .remove(uploadedImages.map((u) => u.path));
        }
        return { error: "image upload failed — try again" };
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { action: "booking_upload" },
        extra: { bookingId, path },
      });
      if (uploadedImages.length > 0) {
        await serviceClient.storage
          .from("bookings")
          .remove(uploadedImages.map((u) => u.path));
      }
      return { error: "image upload failed — try again" };
    }

    uploadedImages.push({
      path,
      originalFilename: file.name,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      fileSize: processed.fileSize,
    });
  }

  // Generate a magic-link token only when we can actually deliver it.
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const requestDate = slotDate ?? data.preferred_date ?? null;

  // Capture studio snapshot from the primary public studio if provided
  let bookingStudioId: string | null = null;
  let studioSnapshot: Record<string, unknown> | null = null;
  const studioIdVal = (formData.get("studio_id") as string | null)?.trim();
  if (studioIdVal) {
    const { data: studio } = await serviceClient
      .from("studios")
      .select(
        "id, name, visibility_mode, city, country, formatted_address, address, google_maps_url, public_note",
      )
      .eq("id", studioIdVal)
      .eq("artist_id", artistId)
      .neq("visibility_mode", "hidden")
      .single();

    if (studio) {
      bookingStudioId = studio.id;
      const includeAddress = studio.visibility_mode === "public_exact_address";
      studioSnapshot = {
        id: studio.id,
        name: studio.name,
        visibility_mode: studio.visibility_mode,
        city: studio.city,
        country: studio.country,
        formatted_address: includeAddress ? studio.formatted_address : null,
        address: includeAddress ? studio.address : null,
        google_maps_url: includeAddress ? studio.google_maps_url : null,
        public_note: studio.public_note,
        captured_at: new Date().toISOString(),
      };
    }
  }

  const { error: insertError } = await serviceClient
    .from("booking_requests")
    .insert({
      id: bookingId,
      artist_id: artistId,
      status: "pending",
      form_data: {
        instagram_handle: data.instagram_handle,
        reference_link: data.reference_link || null,
        placement: data.placement,
        size: data.size,
        description: data.description,
        ...(customAnswers.length > 0 && { custom_answers: customAnswers }),
      },
      preferred_date: requestDate,
      slot_id: slotId,
      customer_email: data.email || null,
      customer_handle: data.instagram_handle || null,
      customer_token_hash: data.email ? tokenHash : null,
      origin: "public_form",
      ...(tripId ? { trip_id: tripId } : {}),
      ...(bookingStudioId ? { studio_id: bookingStudioId } : {}),
      ...(studioSnapshot ? { studio_snapshot: studioSnapshot } : {}),
    });

  if (insertError) {
    Sentry.captureException(insertError, {
      tags: { action: "booking_insert" },
    });
    if (slotId) {
      // Service-role rollback: anon UPDATE policy only allows open→locked,
      // so the inverse rollback must bypass RLS.
      await serviceClient
        .from("slots")
        .update({ status: "open" })
        .eq("id", slotId);
    }
    if (uploadedImages.length > 0) {
      await serviceClient.storage
        .from("bookings")
        .remove(uploadedImages.map((u) => u.path));
    }
    return { error: "something went wrong — try again" };
  }

  let imageAnnotations: unknown[][] = [];
  try {
    const rawAnnotations = formData.get("annotations_json") as string | null;
    if (rawAnnotations) {
      const parsedAnnotations = JSON.parse(rawAnnotations);
      if (Array.isArray(parsedAnnotations))
        imageAnnotations = parsedAnnotations;
    }
  } catch {
    // Ignore malformed annotation payloads instead of blocking the whole booking.
  }

  if (uploadedImages.length > 0) {
    // Service-role insert: storage upload already used serviceClient (Slice 32),
    // pairing the metadata insert keeps the booking_images write path uniform.
    await serviceClient.from("booking_images").insert(
      uploadedImages.map((img, idx) => {
        const annotations = imageAnnotations[idx];
        return {
          booking_id: bookingId,
          storage_path: img.path,
          original_filename: img.originalFilename,
          mime_type: img.mimeType,
          width: img.width,
          height: img.height,
          file_size: img.fileSize,
          annotations:
            Array.isArray(annotations) && annotations.length > 0
              ? annotations
              : null,
        };
      }),
    );
  }

  // Service-role audit write: server-managed event log, not customer data.
  await serviceClient.from("audit_log").insert({
    booking_id: bookingId,
    action: "booking_created",
    details: { origin: "public_form", ip },
  });

  const notificationResult = await createNotification({
    artistId,
    type: "booking_request",
    category: "booking_activity",
    priority: "high",
    title: "New booking request",
    message: `@${data.instagram_handle} wants a ${data.placement} (${data.size})${requestDate ? ` on ${requestDate}` : ""}.`,
    ctaLabel: "View request",
    ctaHref: `/bookings/requests/${bookingId}`,
    metadata: { booking_id: bookingId },
  });
  if (!notificationResult.ok) {
    console.error("[booking-submit] notification failed", {
      artistId,
      bookingId,
      error: notificationResult.error,
    });
  }

  const magicLinkBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const magicLink = `${magicLinkBase}/request/${token}`;
  const emailVars = {
    customer_handle: data.instagram_handle,
    artist_name: artistName,
    artist_slug: artistSlug,
    placement: data.placement,
    size: data.size,
    date: requestDate ?? "",
    magic_link: magicLink,
  };

  if (data.email) {
    await sendBookingEmail({
      type: "customer_booking_submitted",
      to: data.email,
      artistId,
      vars: emailVars,
      customAnswers,
    });
  }

  try {
    const { data: artistAuth } =
      await serviceClient.auth.admin.getUserById(artistId);
    if (artistAuth?.user?.email) {
      await sendBookingEmail({
        type: "artist_new_booking_request",
        to: artistAuth.user.email,
        artistId,
        vars: emailVars,
        customAnswers,
      });
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { action: "artist_notification_lookup" },
      extra: { artistId, bookingId },
    });
  }

  redirect(
    `/request/submitted?id=${bookingId}&slug=${artistSlug}&email=${data.email ? "1" : "0"}`,
  );
}

export type WaitlistState =
  | { error: string; field?: string }
  | { ok: true }
  | null;

export async function submitWaitlistAction(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  // Honeypot — silently succeed so bots don't know they were blocked.
  if (isHoneypotTriggered(formData.get(HONEYPOT_FIELD))) return { ok: true };

  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const handle = (formData.get("instagram_handle") as string)?.replace(
    /^@/,
    "",
  );
  const email = formData.get("email") as string;
  const note = (formData.get("note") as string) ?? "";
  const cityRaw = ((formData.get("city_text") as string) ?? "").trim();
  const cityText = cityRaw.length > 0 ? cityRaw.slice(0, 100) : null;
  const artistSlug = formData.get("artist_slug") as string;

  if (!handle || handle.length < 1)
    return { error: "instagram handle is required", field: "instagram_handle" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "valid email is required", field: "email" };
  if (note.length > 280)
    return { error: "note must be 280 characters or fewer", field: "note" };

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, display_name")
    .eq("slug", artistSlug)
    .single();

  if (!profile) return { error: "artist not found" };

  const { allowed } = await checkWaitlistRateLimit(ip, profile.id);
  if (!allowed) return { error: "too many requests — try again later" };

  const { error } = await serviceClient.from("waitlist_entries").insert({
    artist_id: profile.id,
    customer_email: email,
    customer_handle: handle,
    note: note || null,
    city_text: cityText,
  });

  if (error) {
    Sentry.captureException(error, { tags: { action: "waitlist_insert" } });
    return { error: "something went wrong — try again" };
  }

  await sendWaitlistConfirmation({
    to: email,
    artistName: profile.display_name,
  });

  return { ok: true };
}
