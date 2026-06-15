import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseBooksSettings } from "@/lib/books-settings";
import { normalizeBooksConfig } from "@/lib/mobile-settings";
import { queryOpenSlotCount } from "@/lib/server/slots";
import { writeAudit } from "@/lib/audit";
import type { MobileBooksSettings } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/settings/books — the full books settings for the edit screen
// (the Home toggle reads booksOpen off /home; this is the settings form's
// source), plus the booking-mode section's read side: the current mode and the
// open-slot count (same filter as GET /booking-form) for the
// fixed-slots-without-slots warning.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const [profileRes, slotCount] = await Promise.all([
    supabase
      .from("profiles")
      .select("settings, booking_mode")
      .eq("id", userId)
      .single(),
    queryOpenSlotCount(supabase, userId),
  ]);
  if (profileRes.error || !profileRes.data) {
    return mobileError(500, profileRes.error?.message ?? "Profile not found.");
  }
  if ("error" in slotCount) return mobileError(500, slotCount.error);
  const settings = (profileRes.data.settings ?? {}) as Record<string, unknown>;
  const body: MobileBooksSettings = {
    ...parseBooksSettings(settings.books_settings),
    bookingMode:
      (profileRes.data.booking_mode as string | null) ?? "preferred_date",
    openSlotCount: slotCount.count,
  };
  return mobileOk(body);
}

// PUT /api/mobile/settings/books — save the full books settings form (open + cap
// + window + closed message). Ports saveBooksSettingsAction, but preserves the
// booking-form theme (form_appearance) the app doesn't edit. The Home toggle uses
// POST (open-only) below.
export async function PUT(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = (profile.settings ?? {}) as Record<string, unknown>;
  const currentBooks = parseBooksSettings(current.books_settings);

  const parsed = normalizeBooksConfig(raw, currentBooks);
  if (!parsed.ok) return mobileError(400, parsed.error);

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, books_settings: parsed.value },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  void writeAudit({
    action: parsed.value.books_open ? "books_opened" : "books_closed",
    actor: userId,
    category: "settings",
    details: { books_open: parsed.value.books_open },
  });

  return mobileOk(parsed.value);
}

// POST /api/mobile/settings/books  { open: boolean } — flip the artist's books
// open/closed (the "one source of truth" control). Preserves the other
// books_settings fields (cap / window / closed-message / appearance), unlike the
// web form which rewrites them. Mirrors the web saveBooksSettingsAction audit.
// RLS-scoped: the artist updates only their own profile.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: { open?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  if (typeof body.open !== "boolean") {
    return mobileError(400, "open must be a boolean.");
  }

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = (profile.settings ?? {}) as Record<string, unknown>;
  const books = parseBooksSettings(current.books_settings);

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...current,
        books_settings: { ...books, books_open: body.open },
      },
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  void writeAudit({
    action: body.open ? "books_opened" : "books_closed",
    actor: userId,
    category: "settings",
    details: { books_open: body.open },
  });

  return mobileOk({ booksOpen: body.open });
}
