"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { parseBooksSettings } from "@/lib/books-settings";
import { createNotification } from "@/lib/notifications";

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

  // Deduplicate — only create if no unresolved warning of this type exists
  const { count } = await serviceClient
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", user.id)
    .eq("type", "system_warning")
    .is("is_resolved", false)
    .contains("metadata", { warning_type: "no_slots_warning" });

  if ((count ?? 0) === 0) {
    const notificationResult = await createNotification({
      artistId: user.id,
      type: "system_warning",
      category: "system_warning",
      priority: "high",
      title: "No time slots set up yet",
      message:
        "Fixed slots mode is active but no time slots have been added. Clients cannot book until you create some slots.",
      ctaLabel: "Set up slots",
      ctaHref: "/bookings/settings",
      isResolved: false,
      metadata: { warning_type: "no_slots_warning" },
    });
    if (!notificationResult.ok) {
      return { error: notificationResult.error };
    }
  }

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
