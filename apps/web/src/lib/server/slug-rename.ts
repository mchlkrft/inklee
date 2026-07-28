import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateSlug } from "@/lib/slug";
import { resolveSlugAvailabilityServer } from "@/lib/server/slug-availability";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { formCustomAllowed } from "./entitlement-gates";
import { writeAudit } from "@/lib/audit";

// The ONE path for renaming an artist's public URL (Plus build P3e), shared by
// the web settings action and the mobile route.
//
// A rename is not a cosmetic edit. The slug IS the public address: it is in
// Instagram bios, printed cards, QR codes and every link a client already has.
// The old URL stops resolving the moment this succeeds, and nothing in the
// system redirects it, so this is deliberately explicit rather than an inline
// field the artist can change by accident.
//
// A redirect table for retired slugs would make renames safe rather than
// merely warned about. That is a real follow-up, recorded in the build plan;
// it is not smuggled in here, because keeping a slug reserved forever has its
// own consequences (it stays unavailable to everyone else).

export type SlugRenameResult =
  | { ok: true; slug: string }
  | {
      ok: false;
      error: string;
      code: "not_entitled" | "invalid" | "taken" | "unchanged" | "failed";
    };

export async function renameSlugCore(
  supabase: SupabaseClient,
  artistId: string,
  rawSlug: unknown,
): Promise<SlugRenameResult> {
  const slug = typeof rawSlug === "string" ? rawSlug.trim().toLowerCase() : "";
  if (!slug) return { ok: false, code: "invalid", error: "Enter a link name." };

  const formatError = validateSlug(slug);
  if (formatError) return { ok: false, code: "invalid", error: formatError };

  const { data: profile, error: readErr } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", artistId)
    .single();
  if (readErr || !profile) {
    return { ok: false, code: "failed", error: "Couldn't load your profile." };
  }
  const currentSlug = (profile.slug as string | null) ?? null;

  // Checked BEFORE the entitlement so a no-op save never reports a plan
  // problem, and so re-submitting the form is harmless.
  if (currentSlug === slug) {
    return { ok: false, code: "unchanged", error: "That's already your link." };
  }

  // An artist with NO slug yet is claiming, not renaming: that path belongs to
  // onboarding and is free for everyone. Only a change is gated.
  if (currentSlug !== null) {
    try {
      if (!formCustomAllowed(await getAccountOverrides(artistId))) {
        return {
          ok: false,
          code: "not_entitled",
          error: "Changing your link is part of Plus.",
        };
      }
    } catch {
      return {
        ok: false,
        code: "failed",
        error: "Couldn't verify your plan. Please try again.",
      };
    }
  }

  // Service-role availability check: an RLS read cannot see other artists'
  // rows (migration 0030), so an RLS-scoped lookup would call every taken slug
  // free. Same helper the onboarding claim and the mobile slug-check use.
  const { available } = await resolveSlugAvailabilityServer(slug, artistId);
  if (!available) {
    return { ok: false, code: "taken", error: "That link is already taken." };
  }

  const { error: writeErr } = await supabase
    .from("profiles")
    .update({ slug })
    .eq("id", artistId);
  if (writeErr) {
    // The unique constraint is the real arbiter: the availability check above
    // is a read, and two artists can pass it in the same instant.
    if (writeErr.code === "23505") {
      return { ok: false, code: "taken", error: "That link is already taken." };
    }
    return { ok: false, code: "failed", error: "Couldn't save. Try again." };
  }

  // Audited because it changes a public identifier and, from support's side,
  // "my page 404s" and "someone took my name" both start here.
  await writeAudit({
    action: "profile_slug_renamed",
    actor: artistId,
    category: "settings",
    details: { from: currentSlug, to: slug },
  });

  return { ok: true, slug };
}
