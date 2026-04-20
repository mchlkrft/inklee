"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { bookingSchema } from "@/lib/booking-schema";
import { checkRateLimit } from "@/lib/ratelimit";
import { sendBookingEmail } from "@/lib/email/send-booking-email";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { validateCustomAnswers } from "@/lib/custom-fields";
import type { CustomFieldDef, CustomAnswerSnapshot } from "@/lib/custom-fields";

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
    return {
      error: "too many requests — please wait before submitting again",
    };
  }

  // Parse and validate form fields
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
  const chosen = new Date(data.preferred_date);
  if (chosen <= today) {
    return {
      error: "preferred date must be a future date",
      field: "preferred_date",
    };
  }

  // Validate custom fields
  const formArtistId = formData.get("artist_id") as string | null;
  let customAnswers: CustomAnswerSnapshot[] = [];
  if (formArtistId) {
    const { data: activeFields } = await (await createClient())
      .from("custom_fields")
      .select("*")
      .eq("artist_id", formArtistId)
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
    if (file.size > MAX_IMAGE_SIZE) {
      return { error: `each image must be under 10mb` };
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { error: "images must be jpg, png, or webp" };
    }
  }

  const supabase = await createClient();
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
    const { error: uploadError } = await supabase.storage
      .from("bookings")
      .upload(path, buffer, { contentType: file.type });
    if (uploadError) return { error: "image upload failed — try again" };
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
      artist_id: await getArtistIdFromSlug(
        supabase,
        formData.get("artist_slug") as string,
      ),
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
    // Revert slot lock if booking insert failed
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

  // Fetch artist profile for email vars
  const artistSlug = formData.get("artist_slug") as string;
  const { data: artistProfile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("slug", artistSlug)
    .single();

  const artistId = artistProfile?.id ?? "";
  const artistName = artistProfile?.display_name ?? artistSlug;
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
  });

  // Artist new request notification
  const { data: artistAuth } =
    await serviceClient.auth.admin.getUserById(artistId);
  if (artistAuth?.user?.email) {
    await sendBookingEmail({
      type: "artist_new_booking_request",
      to: artistAuth.user.email,
      artistId,
      vars: emailVars,
    });
  }

  redirect(
    `/request/submitted?id=${bookingId}&slug=${formData.get("artist_slug")}`,
  );
}

// Artist profile lookup
async function getArtistIdFromSlug(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  slug: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .single();
  return data.id;
}
