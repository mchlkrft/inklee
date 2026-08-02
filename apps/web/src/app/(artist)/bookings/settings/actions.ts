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
import { isBookingMode } from "@inklee/shared/booking-domain";
import { updateProfileSettings } from "@/lib/server/profile-settings";

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

  const mode = formData.get("booking_mode");
  if (!isBookingMode(mode)) {
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

  const result = await updateProfileSettings(supabase, user.id, (current) => {
    const currentBooks = parseBooksSettings(current.books_settings);
    return {
      ...current,
      books_settings: { ...currentBooks, books_open: open },
    };
  });

  if (!result.ok) return { error: result.error };

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
  // Scheduled open date (P3f), the counterpart to the close date above.
  const opensAt = (formData.get("booking_opens_at") as string) || null;

  const closedMessage =
    (formData.get("books_closed_message") as string)?.trim() || null;
  if (closedMessage && closedMessage.length > 280) {
    return { error: "closed message must be 280 characters or fewer" };
  }

  const result = await updateProfileSettings(supabase, user.id, (current) => {
    const currentBooks = parseBooksSettings(current.books_settings);
    return {
      ...current,
      books_settings: {
        ...currentBooks,
        // books_open is managed by toggleBooksOpenAction — preserve from DB
        booking_cap: bookingCap,
        booking_opens_at: opensAt,
        booking_window_ends_at: windowEndsAt,
        books_closed_message: closedMessage,
      },
    };
  });

  if (!result.ok) return { error: result.error };

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

  const result = await updateProfileSettings(supabase, user.id, (current) => {
    const currentBooks = parseBooksSettings(current.books_settings);
    return {
      ...current,
      books_settings: {
        ...currentBooks,
        form_appearance: appearance,
      },
    };
  });

  if (!result.ok) return { error: result.error };

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

  // slug is read separately from settings — it is only used to revalidate the
  // public page cache below, a display-freshness concern, not a data-merge
  // one, so it does not need the same protected read as profiles.settings. A
  // failed read here just skips that one revalidatePath call, same
  // tolerance as before.
  const { data: existing } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", user.id)
    .maybeSingle();

  const result = await updateProfileSettings(
    supabase,
    user.id,
    (current) => {
      const currentBio = parseBioPageSettings(current.bio_page);
      // `policy` in `hidden` means the section is hidden on the booking page.
      const hidden: BioModuleKey[] = currentBio.hidden.filter(
        (k) => k !== "policy",
      );
      if (!showOnPage) hidden.push("policy");
      const bioPage = parseBioPageSettings({
        ...currentBio,
        bookingPolicy: policy,
        hidden,
      });
      return { ...current, bio_page: bioPage };
    },
    { updated_at: new Date().toISOString() },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/bookings/settings");
  if (existing?.slug) revalidatePath(`/${existing.slug}`);
  return { success: true };
}

// Shop teaser visibility on the booking page (decision S2, Plus build C5).
// `hidden: ["shop"]` was already read everywhere (the public page, the parser)
// but had no writer anywhere — this is that writer. Same shape as
// saveBookingPolicyAction: read the current bio_page, toggle only the "shop"
// key in `hidden`, and write back through the shared parser so bookingPolicy
// and every other module's visibility are preserved untouched. This governs
// ONLY the booking-page teaser; the STANDALONE shop's own visibility is the
// separate `settings.features.shop_checkout` flag (non-cascading, S2).
export async function saveShopVisibilityAction(
  showShop: boolean,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // slug is read separately — display-freshness only, see the identical note
  // in saveBookingPolicyAction above.
  const { data: existing } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", user.id)
    .maybeSingle();

  const result = await updateProfileSettings(
    supabase,
    user.id,
    (current) => {
      const currentBio = parseBioPageSettings(current.bio_page);
      const hidden: BioModuleKey[] = currentBio.hidden.filter(
        (k) => k !== "shop",
      );
      if (!showShop) hidden.push("shop");
      const bioPage = parseBioPageSettings({ ...currentBio, hidden });
      return { ...current, bio_page: bioPage };
    },
    { updated_at: new Date().toISOString() },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/bookings/settings");
  if (existing?.slug) revalidatePath(`/${existing.slug}`);
  return { success: true };
}
