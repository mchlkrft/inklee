import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseSurfaceContentSettings,
  isSurfaceContentSurface,
  parseFeaturedCollectionIds,
  MAX_INTRO_TEXT,
  type SurfaceContent,
  type SurfaceContentSurface,
} from "@inklee/shared/surface-content";
import { sanitizeHostedPublicImageUrl } from "@inklee/shared/bio-page";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { richContentBlocksAllowed } from "./entitlement-gates";

// The ONE write path for surface content configuration (founder ruling FD10,
// 2026-08-01), mirroring appearance-write.ts's saveAppearanceCore so the two
// content-vs-styling layers enforce with the identical shape (the deposits-
// gate drift lesson): entitlement refused server-side, never hidden only in
// the UI, and a merge-write that never clobbers sibling settings keys.
//
// ENTITLEMENT: `rich_content_blocks`, not `appearance_custom` — this is
// CONTENT (a hero image, an intro line, which collections to feature), the
// same split founder ruling FD1 drew for Hub galleries. See surface-
// content.ts's module header for the full reasoning; kept consistent here
// rather than re-litigated per call site.
//
// NULL-CLEARS-VS-INHERITS, the same discipline appearance-write.ts's
// `normalize()` applies to `accent`: a field ABSENT from the input patch
// leaves the currently stored value untouched (so editing the intro text
// alone can never wipe an already-set hero image or featured collections);
// a field PRESENT in the input — even if it sanitizes to null / empty —
// overwrites the stored value, which is how an artist clears a field. The
// `"key" in input` check is what tells "the client didn't send this field"
// apart from "the client sent an empty value for this field"; a plain
// `input.heroMediaUrl ?? current.heroMediaUrl` cannot make that distinction,
// because both undefined-key and explicit-null collapse to the same `??`
// branch.

export type SurfaceContentInput = {
  surface: unknown;
  heroMediaUrl?: unknown;
  introText?: unknown;
  featuredCollectionIds?: unknown;
};

export type SurfaceContentWriteResult =
  | { ok: true; content: SurfaceContent }
  | { ok: false; error: string; code: "not_entitled" | "invalid" | "failed" };

function normalize(input: SurfaceContentInput): Partial<SurfaceContent> {
  const patch: Partial<SurfaceContent> = {};
  if ("heroMediaUrl" in input) {
    patch.heroMediaUrl = sanitizeHostedPublicImageUrl(input.heroMediaUrl);
  }
  if ("introText" in input) {
    const t =
      typeof input.introText === "string"
        ? input.introText.trim().slice(0, MAX_INTRO_TEXT)
        : "";
    patch.introText = t || null;
  }
  if ("featuredCollectionIds" in input) {
    patch.featuredCollectionIds = parseFeaturedCollectionIds(
      input.featuredCollectionIds,
    );
  }
  return patch;
}

/**
 * Save a surface content change for an artist. Always scoped to one surface
 * (unlike appearance, there is no "global" content tier — see surface-
 * content.ts's header for why). Returns the resolved entry so a caller can
 * render it back without a second read.
 */
export async function saveSurfaceContentCore(
  supabase: SupabaseClient,
  artistId: string,
  input: SurfaceContentInput,
): Promise<SurfaceContentWriteResult> {
  if (!isSurfaceContentSurface(input.surface)) {
    return { ok: false, code: "invalid", error: "Unknown surface." };
  }
  const surface: SurfaceContentSurface = input.surface;

  try {
    if (!richContentBlocksAllowed(await getAccountOverrides(artistId))) {
      return {
        ok: false,
        code: "not_entitled",
        error: "Custom shop content isn't included in your current plan.",
      };
    }
  } catch {
    // Plan-read blip: refuse the WRITE (unlike the render path, which fails
    // safe to the default view). Writing an entitled-only shape on an
    // unverified plan is the worse error; the artist can retry.
    return {
      ok: false,
      code: "failed",
      error: "Couldn't verify your plan. Please try again.",
    };
  }

  const patch = normalize(input);
  if (Object.keys(patch).length === 0) {
    return { ok: false, code: "invalid", error: "Nothing to save." };
  }

  const { data: row, error: readErr } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .single();
  if (readErr || !row) {
    return { ok: false, code: "failed", error: "Couldn't load your settings." };
  }

  const settings = (row.settings ?? {}) as Record<string, unknown>;
  // Parse the CURRENT state so this save only touches the fields the caller
  // actually sent, preserving every other stored field on this surface AND
  // every other surface's entry untouched.
  const current = parseSurfaceContentSettings(settings.surface_content);
  const currentEntry = current[surface] ?? {
    heroMediaUrl: null,
    introText: null,
    featuredCollectionIds: [] as string[],
  };

  const nextEntry: SurfaceContent = { ...currentEntry, ...patch };
  const nextContainer = { ...current, [surface]: nextEntry };

  const { error: writeErr } = await supabase
    .from("profiles")
    .update({ settings: { ...settings, surface_content: nextContainer } })
    .eq("id", artistId);
  if (writeErr) {
    return { ok: false, code: "failed", error: "Couldn't save. Try again." };
  }

  return { ok: true, content: nextEntry };
}
