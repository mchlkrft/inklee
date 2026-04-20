"use server";

import { createClient } from "@/lib/supabase/server";
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
import type { CustomFieldDef, CustomAnswerSnapshot } from "@/lib/custom-fields";
import { parseBooksSettings } from "@/lib/books-settings";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGES = 5;

type State = { error: string; field?: string } | null;

export async function submitBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  // Honeypot check — silently succeed so bots don't know they were blocked
  const honeypot = formData.get("website") as string;
  if (honeypot) return null;

  // Rate limit by IP
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(ip);
  if (!allowed) {
    return { error: "too many requests — please wait before submitting again" };
  }

  // Core form validation
  const raw = {
    instagram_handle: formData.get("instagram_handle"),
    email: formData.get("email"),
    reference_link: formData.get("reference_link"),
    placement: formData.get("placement"),
    size: formData.get("size"),
    description: formData.get("description"),
    preferred_date: formData.get("preferred_date"),
    website: formData.get("website"),
  };

  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first.message, field: first.path[0] as string };
  }

  const data = parsed.data;

  // Validate preferred date is in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(data.preferred_date) <= today) {
    return {
      error: "preferred date must be a future date",
      field: "preferred_date",
    };
  }

  // Init client and look up artist from slug — canonical source for artist_id
  const artistSlug = formData.get("artist_slug") as string;
  const supabase = await createClient();
  const { data: artistProfile } = await supabase
    .from("profiles")
    .select("id, display_name, settings")
    .eq("slug", artistSlug)
    .single();

  if (!artistProfile) return { error: "artist not found" };
  const artistId = artistProfile.id;
  const artistName = artistProfile.display_name;

  // Books-open and cap enforcement (Slice 20)
  const profileSettings = (artistProfile.settings ?? {}) as Record<
    string,
    unknown
  >;
  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    new Date(booksSettings.booking_window_ends_at) < new Date();
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
  // Uses canonical artistId — not a form-supplied value
  let customAnswers: CustomAnswerSnapshot[] = [];
  {
    const { data: activeFields } = await supabase
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

  const bookingId = crypto.randomUUID();
  const bookingMode = formData.get("booking_mode") as string;

  // Slot mode: atomically lock the slot before proceeding
  let slotId: string | null = null;
  let slotDate: string | null = null;
  if (bookingMode === "fixed_slots") {
    const rawSlotId = formData.get("slot_id") as string;
    if (!rawSlotId) return { error: "please select a slot", field: "slot_id" };

    const { data: locked } = await supabase
      .from("slots")
      .update({ status: "locked" })
      .eq("id", rawSlotId)
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
    slotDate = locked.starts_at.split("T")[0];
  }

  // Upload images to Supabase Storage
  const storagePaths: string[] = [];
  for (const file of realImages) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${bookingId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const { error: uploadError } = await serviceClient.storage
        .from("bookings")
        .upload(path, buffer, { contentType: file.type });

      if (uploadError) {
        Sentry.captureMessage("booking image upload failed", {
          level: "error",
          tags: { action: "booking_upload" },
          extra: {
            bookingId,
            path,
            contentType: file.type,
            message: uploadError.message,
          },
        });
        return { error: "image upload failed — try again" };
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { action: "booking_upload" },
        extra: { bookingId, path, contentType: file.type },
      });
      return { error: "image upload failed — try again" };
    }
    storagePaths.push(path);
  }

  // Generate magic-link token
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Insert booking request
  const { error: insertError } = await supabase
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
      preferred_date: slotDate ?? data.preferred_date,
      slot_id: slotId,
      customer_email: data.email,
      customer_handle: data.instagram_handle,
      customer_token_hash: tokenHash,
      origin: "public_form",
    });

  if (insertError) {
    Sentry.captureException(insertError, {
      tags: { action: "booking_insert" },
    });
    if (slotId) {
      await supabase.from("slots").update({ status: "open" }).eq("id", slotId);
    }
    return { error: "something went wrong — try again" };
  }

  // Insert booking images
  if (storagePaths.length > 0) {
    await supabase.from("booking_images").insert(
      storagePaths.map((path) => ({
        booking_id: bookingId,
        storage_path: path,
      })),
    );
  }

  // Write audit log
  await supabase.from("audit_log").insert({
    booking_id: bookingId,
    action: "booking_created",
    details: { origin: "public_form", ip },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const magicLink = `${appUrl}/request/${token}`;
  const emailVars = {
    customer_handle: data.instagram_handle,
    artist_name: artistName,
    artist_slug: artistSlug,
    placement: data.placement,
    size: data.size,
    date: data.preferred_date,
    magic_link: magicLink,
  };

  // Customer confirmation
  await sendBookingEmail({
    type: "customer_booking_submitted",
    to: data.email,
    artistId,
    vars: emailVars,
    customAnswers,
  });

  // Artist new request notification
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

  redirect(`/request/submitted?id=${bookingId}&slug=${artistSlug}`);
}

export type WaitlistState =
  | { error: string; field?: string }
  | { ok: true }
  | null;

export async function submitWaitlistAction(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  // Honeypot
  if (formData.get("website")) return { ok: true };

  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkWaitlistRateLimit(ip);
  if (!allowed) return { error: "too many requests — try again later" };

  const handle = (formData.get("instagram_handle") as string)?.replace(
    /^@/,
    "",
  );
  const email = formData.get("email") as string;
  const note = (formData.get("note") as string) ?? "";
  const artistSlug = formData.get("artist_slug") as string;

  if (!handle || handle.length < 1)
    return { error: "instagram handle is required", field: "instagram_handle" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "valid email is required", field: "email" };
  if (note.length > 280)
    return { error: "note must be 280 characters or fewer", field: "note" };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("slug", artistSlug)
    .single();

  if (!profile) return { error: "artist not found" };

  const { error } = await serviceClient.from("waitlist_entries").insert({
    artist_id: profile.id,
    customer_email: email,
    customer_handle: handle,
    note: note || null,
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
