import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseBooksSettings } from "@/lib/books-settings";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

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
