"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { parseBooksSettings } from "@/lib/books-settings";
import {
  parseBioPageSettings,
  type BioModuleKey,
} from "@/lib/bio-page-settings";
import { fileNoSlotsWarning } from "@/lib/server/slots";

type State = { error: string } | { success: true } | null;

export async function saveBookingModeAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const mode = formData.get("booking_mode") as string;
  if (mode !== "preferred_date" && mode !== "fixed_slots") {
    return { error: "Invalid booking mode." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ booking_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  void writeAudit({
    action: "booking_mode_changed",
    actor: user.id,
    category: "settings",
    details: { to: mode },
  });

  revalidatePath("/bookings/settings");
  return { success: true };
}

export async function toggleBooksOpenAction(
  open: boolean,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: existing } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const current = (existing?.settings ?? {}) as Record<string, unknown>;
  const currentBooks = parseBooksSettings(current.books_settings);

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...current,
        books_settings: { ...currentBooks, books_open: open },
      },
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  void writeAudit({
    action: open ? "books_opened" : "books_closed",
    actor: user.id,
    category: "settings",
    details: { books_open: open },
  });

  revalidatePath("/bookings/settings");
  return { success: true };
}

export async function skipSlotSetupAction(): Promise<
  { error: string } | { success: true }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Deduped filing lives in the shared slot core (the mobile booking-mode
  // route files through the same helper).
  const result = await fileNoSlotsWarning(user.id);
  if (!result.ok) return { error: result.error };

  return { success: true };
}

export async function saveAvailabilityAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const capRaw = formData.get("booking_cap") as string;
  const bookingCap =
    capRaw && !isNaN(Number(capRaw)) && Number(capRaw) > 0
      ? Number(capRaw)
      : null;

  const windowEndsAt =
    (formData.get("booking_window_ends_at") as string) || null;

  const closedMessage =
    (formData.get("books_closed_message") as string)?.trim() || null;
  if (closedMessage && closedMessage.length > 280) {
    return { error: "closed message must be 280 characters or fewer" };
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const current = (existing?.settings ?? {}) as Record<string, unknown>;
  const currentBooks = parseBooksSettings(current.books_settings);

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...current,
        books_settings: {
          ...currentBooks,
          // books_open is managed by toggleBooksOpenAction — preserve from DB
          booking_cap: bookingCap,
          booking_window_ends_at: windowEndsAt,
          books_closed_message: closedMessage,
        },
      },
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/bookings/settings");
  return { success: true };
}

export async function saveFormAppearanceAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const appearance = formData.get("form_appearance") as string;
  if (
    appearance !== "dark" &&
    appearance !== "light" &&
    appearance !== "auto"
  ) {
    return { error: "invalid appearance value" };
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const current = (existing?.settings ?? {}) as Record<string, unknown>;
  const currentBooks = parseBooksSettings(current.books_settings);

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...current,
        books_settings: {
          ...currentBooks,
          form_appearance: appearance,
        },
      },
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/bookings/settings");
  revalidatePath("/bookings/booking-form");
  revalidatePath("/[slug]");
  return { success: true };
}

// Booking policy is stored in the shared bio_page model but edited here (it is a
// booking-page concern, not a Link Hub one). Preserve the rest of bio_page
// (headline/text/links/socials, owned by the Link Hub editor) and only touch the
// policy text + its `policy` visibility flag, round-tripping through the shared
// parser so validation lives in one place.
export async function saveBookingPolicyAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const policy =
    ((formData.get("booking_policy") as string | null) ?? "").trim() || null;
  const showOnPage = formData.get("show_policy") === "on";

  const { data: existing } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", user.id)
    .single();

  const current = (existing?.settings ?? {}) as Record<string, unknown>;
  const currentBio = parseBioPageSettings(current.bio_page);

  // `policy` in `hidden` means the section is hidden on the booking page.
  const hidden: BioModuleKey[] = currentBio.hidden.filter(
    (k) => k !== "policy",
  );
  if (!showOnPage) hidden.push("policy");

  const settings = parseBioPageSettings({
    ...currentBio,
    bookingPolicy: policy,
    hidden,
  });

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, bio_page: settings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/bookings/settings");
  if (existing?.slug) revalidatePath(`/${existing.slug}`);
  return { success: true };
}
