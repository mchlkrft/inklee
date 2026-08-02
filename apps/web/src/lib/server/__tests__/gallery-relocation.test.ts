import { describe, it, expect, vi, beforeEach } from "vitest";

// Gallery downgrade relocation (counsel C1.5,
// docs/legal/counsel-accountant-handoff-2026-08.md Part 4, migration 0144).
// Backed by a small in-memory store (storage buckets + the two DB tables
// touched) so the REAL move/retry/mark-on-success logic runs, rather than
// mocking it away — the half-failure behaviour is the whole point of this
// module and only shows up if a "move" can actually fail mid-run.

const BASE = "https://x.supabase.co/storage/v1/object/public/logos";

type OverrideRow = {
  artist_id: string;
  plan_tier?: string;
  plan_expires_at?: string | null;
  entitlement_overrides?: Record<string, boolean>;
  gallery_relocated_at?: string | null;
};

const h = vi.hoisted(() => {
  const profiles: Record<string, { settings: unknown }> = {};
  const overrides: Record<string, OverrideRow> = {};
  const buckets: Record<string, Set<string>> = {
    logos: new Set(),
    "gallery-archive": new Set(),
  };
  const forceFail = new Set<string>();
  const forceListFail = new Set<string>();
  const forceProfileFail = new Set<string>();
  const captureMessage = vi.fn();
  const captureException = vi.fn();

  function splitTopLevel(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    if (cur) out.push(cur);
    return out;
  }
  function evalSimple(cond: string, row: OverrideRow): boolean {
    const [col, op, val] = cond.split(".");
    const cur = (row as Record<string, unknown>)[col];
    if (op === "eq") return String(cur) === val;
    if (op === "lt")
      return cur != null && new Date(cur as string).getTime() < Date.parse(val);
    return false;
  }
  function evalOr(pred: string, row: OverrideRow): boolean {
    return splitTopLevel(pred).some((clause) => {
      if (clause.startsWith("and(") && clause.endsWith(")")) {
        return splitTopLevel(clause.slice(4, -1)).every((p) =>
          evalSimple(p, row),
        );
      }
      return evalSimple(clause, row);
    });
  }

  function overridesBuilder() {
    const filters: Array<{
      t: "eq" | "is" | "not_is";
      col: string;
      val?: unknown;
    }> = [];
    let orPred: string | null = null;
    let updatePayload: Record<string, unknown> | null = null;
    let single = false;

    const match = (row: OverrideRow) => {
      for (const f of filters) {
        const cur = (row as Record<string, unknown>)[f.col];
        if (f.t === "eq" && cur !== f.val) return false;
        if (f.t === "is" && !(cur === null || cur === undefined)) return false;
        if (f.t === "not_is" && (cur === null || cur === undefined))
          return false;
      }
      if (orPred && !evalOr(orPred, row)) return false;
      return true;
    };

    const resolve = () => {
      const rows = Object.values(overrides);
      if (updatePayload) {
        const matched = rows.filter(match);
        matched.forEach((r) => Object.assign(r, updatePayload));
        return Promise.resolve({ data: matched, error: null });
      }
      const matched = rows.filter(match).map((r) => ({ ...r }));
      if (single) {
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      }
      return Promise.resolve({ data: matched, error: null });
    };

    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters.push({ t: "eq", col, val });
        return b;
      },
      is: (col: string, val: unknown) => {
        filters.push({ t: val === null ? "is" : "eq", col, val });
        return b;
      },
      not: (col: string, _op: string, val: unknown) => {
        filters.push({ t: val === null ? "not_is" : "eq", col, val });
        return b;
      },
      or: (pred: string) => {
        orPred = pred;
        return b;
      },
      update: (payload: Record<string, unknown>) => {
        updatePayload = payload;
        return b;
      },
      maybeSingle: () => {
        single = true;
        return resolve();
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        resolve().then(res, rej),
    };
    return b;
  }

  function profilesBuilder() {
    let artistId: string | null = null;
    const b = {
      select: () => b,
      eq: (_col: string, val: string) => {
        artistId = val;
        return b;
      },
      maybeSingle: () => {
        if (artistId && forceProfileFail.has(artistId)) {
          return Promise.resolve({
            data: null,
            error: { message: "connection reset" },
          });
        }
        return Promise.resolve({
          data: artistId ? (profiles[artistId] ?? null) : null,
          error: null,
        });
      },
    };
    return b;
  }

  const serviceClient = {
    from: (table: string) => {
      if (table === "profiles") return profilesBuilder();
      if (table === "account_overrides") return overridesBuilder();
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from: (bucket: string) => ({
        move: async (
          fromPath: string,
          _toPath: string,
          opts?: { destinationBucket?: string },
        ) => {
          const dest = opts?.destinationBucket ?? bucket;
          if (forceFail.has(fromPath)) {
            return { data: null, error: { message: "boom" } };
          }
          if (!buckets[bucket]?.has(fromPath)) {
            return { data: null, error: { message: "not found" } };
          }
          buckets[bucket].delete(fromPath);
          (buckets[dest] ??= new Set()).add(fromPath);
          return { data: { message: "Successfully moved" }, error: null };
        },
        list: async (dir: string, opts?: { search?: string }) => {
          const full = dir
            ? `${dir}/${opts?.search ?? ""}`
            : (opts?.search ?? "");
          if (forceListFail.has(full)) {
            return { data: null, error: { message: "list boom" } };
          }
          const present = buckets[bucket]?.has(full);
          return {
            data: present ? [{ name: opts?.search ?? "" }] : [],
            error: null,
          };
        },
      }),
    },
  };

  return {
    profiles,
    overrides,
    buckets,
    forceFail,
    forceListFail,
    forceProfileFail,
    serviceClient,
    captureMessage,
    captureException,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...a: unknown[]) => h.captureMessage(...a),
  captureException: (...a: unknown[]) => h.captureException(...a),
}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: h.serviceClient }));

import {
  relocateArtistGallery,
  restoreArtistGallery,
  galleryCurrentlyEntitled,
  runGalleryRelocationSweep,
  GALLERY_PUBLIC_BUCKET,
  GALLERY_ARCHIVE_BUCKET,
} from "@/lib/server/gallery-relocation";

function galleryProfile(artistId: string, ...names: string[]) {
  return {
    settings: {
      bio_page: {
        blocks: [
          {
            id: "g1",
            type: "image_gallery",
            layout: "grid",
            images: names.map((n) => ({ url: `${BASE}/${artistId}/hub/${n}` })),
          },
        ],
        socials: [],
      },
    },
  };
}

beforeEach(() => {
  for (const k of Object.keys(h.profiles)) delete h.profiles[k];
  for (const k of Object.keys(h.overrides)) delete h.overrides[k];
  h.buckets.logos = new Set();
  h.buckets["gallery-archive"] = new Set();
  h.forceFail.clear();
  h.forceListFail.clear();
  h.forceProfileFail.clear();
  h.captureMessage.mockClear();
  h.captureException.mockClear();
});

describe("relocateArtistGallery", () => {
  it("moves every hosted object out of the public bucket and marks the artist archived", async () => {
    h.profiles.u1 = galleryProfile("u1", "a.webp", "b.webp");
    h.overrides.u1 = { artist_id: "u1" };
    h.buckets[GALLERY_PUBLIC_BUCKET].add("u1/hub/a.webp");
    h.buckets[GALLERY_PUBLIC_BUCKET].add("u1/hub/b.webp");

    const result = await relocateArtistGallery("u1");

    expect(result).toEqual({ ok: true, moved: 2, failed: 0, failedPaths: [] });
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].has("u1/hub/a.webp")).toBe(false);
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].has("u1/hub/b.webp")).toBe(false);
    expect(h.buckets[GALLERY_ARCHIVE_BUCKET].has("u1/hub/a.webp")).toBe(true);
    expect(h.buckets[GALLERY_ARCHIVE_BUCKET].has("u1/hub/b.webp")).toBe(true);
    expect(h.overrides.u1.gallery_relocated_at).toBeTruthy();
  });

  it("no-ops (but still marks archived) for an artist with no gallery images", async () => {
    h.profiles.u2 = { settings: { bio_page: { blocks: [], socials: [] } } };
    h.overrides.u2 = { artist_id: "u2" };

    const result = await relocateArtistGallery("u2");

    expect(result).toEqual({ ok: true, moved: 0, failed: 0, failedPaths: [] });
    expect(h.overrides.u2.gallery_relocated_at).toBeTruthy();
  });

  it("does NOT mark archived when the profile read fails (must not be confused with zero images)", async () => {
    // Same shape of profile row as the genuine no-images artist above (no
    // gallery-image blocks), but this artist's OWN read is forced to error.
    // Before the fix, the discarded error made this indistinguishable from
    // u2 above: both resolved to `paths: []` and got marked archived despite
    // the artist's actual gallery never having been inspected.
    h.profiles.u2b = { settings: { bio_page: { blocks: [], socials: [] } } };
    h.overrides.u2b = { artist_id: "u2b" };
    h.forceProfileFail.add("u2b");

    const result = await relocateArtistGallery("u2b");

    expect(result).toEqual({ ok: false, moved: 0, failed: 0, failedPaths: [] });
    expect(h.overrides.u2b.gallery_relocated_at ?? null).toBeNull();
    expect(h.captureException).toHaveBeenCalled();
  });

  it("a half-failed relocation leaves the marker NULL and is observable via Sentry", async () => {
    h.profiles.u3 = galleryProfile("u3", "ok.webp", "bad.webp");
    h.overrides.u3 = { artist_id: "u3" };
    h.buckets[GALLERY_PUBLIC_BUCKET].add("u3/hub/ok.webp");
    h.buckets[GALLERY_PUBLIC_BUCKET].add("u3/hub/bad.webp");
    h.forceFail.add("u3/hub/bad.webp");

    const result = await relocateArtistGallery("u3");

    expect(result.ok).toBe(false);
    expect(result.moved).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedPaths).toEqual(["u3/hub/bad.webp"]);
    // The succeeding object DID move (never left half-relocated as a set).
    expect(h.buckets[GALLERY_ARCHIVE_BUCKET].has("u3/hub/ok.webp")).toBe(true);
    // The failing object is untouched — still public, still retryable.
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].has("u3/hub/bad.webp")).toBe(true);
    // NOT marked archived: a half-done relocation must not read as "handled".
    expect(h.overrides.u3.gallery_relocated_at).toBeFalsy();
    expect(h.captureMessage).toHaveBeenCalledWith(
      "Gallery downgrade relocation incomplete",
      expect.objectContaining({
        tags: expect.objectContaining({
          action: "gallery_downgrade_relocation",
        }),
      }),
    );
  });

  it("is retryable: a RETRY after a half-failure completes the job and marks archived", async () => {
    h.profiles.u4 = galleryProfile("u4", "ok.webp", "wasbad.webp");
    h.overrides.u4 = { artist_id: "u4" };
    h.buckets[GALLERY_PUBLIC_BUCKET].add("u4/hub/ok.webp");
    h.buckets[GALLERY_PUBLIC_BUCKET].add("u4/hub/wasbad.webp");
    h.forceFail.add("u4/hub/wasbad.webp");

    const first = await relocateArtistGallery("u4");
    expect(first.ok).toBe(false);
    expect(h.overrides.u4.gallery_relocated_at).toBeFalsy();

    // The transient fault clears; the SAME call is retried (e.g. by the
    // nightly sweep) with no other state change.
    h.forceFail.delete("u4/hub/wasbad.webp");
    const second = await relocateArtistGallery("u4");

    // "ok.webp" moved on the FIRST attempt and is now absent from `logos` —
    // re-attempting it classifies as already-done, not a failure. "wasbad.webp"
    // is a genuine new move now that the fault cleared. Both count toward
    // `moved`, which is exactly the property that matters: NEITHER object is
    // publicly reachable any more.
    expect(second).toEqual({ ok: true, moved: 2, failed: 0, failedPaths: [] });
    expect(h.overrides.u4.gallery_relocated_at).toBeTruthy();
    expect(h.buckets[GALLERY_ARCHIVE_BUCKET].has("u4/hub/ok.webp")).toBe(true);
    expect(h.buckets[GALLERY_ARCHIVE_BUCKET].has("u4/hub/wasbad.webp")).toBe(
      true,
    );
  });

  it("treats an object already gone from the source as done, not a failure (idempotent re-run)", async () => {
    // Simulates a prior attempt that moved the object but crashed before
    // marking gallery_relocated_at: it is only in the archive now.
    h.profiles.u5 = galleryProfile("u5", "already.webp");
    h.overrides.u5 = { artist_id: "u5" };
    h.buckets[GALLERY_ARCHIVE_BUCKET].add("u5/hub/already.webp");

    const result = await relocateArtistGallery("u5");

    expect(result).toEqual({ ok: true, moved: 1, failed: 0, failedPaths: [] });
    expect(h.overrides.u5.gallery_relocated_at).toBeTruthy();
  });

  it("a storage list failure after a failed move counts as still-failing, not already_done", async () => {
    // The move itself fails AND the follow-up presence check also errors, so
    // there is no confirmation either way. Before the fix, a null `data` from
    // the failed `list` call made `presentAtSource` false by default, so this
    // was misclassified as "already_done" and counted toward `moved` — the
    // object was still sitting in the public bucket while the sweep reported
    // it archived.
    h.profiles.u9 = galleryProfile("u9", "bad.webp");
    h.overrides.u9 = { artist_id: "u9" };
    h.buckets[GALLERY_PUBLIC_BUCKET].add("u9/hub/bad.webp");
    h.forceFail.add("u9/hub/bad.webp");
    h.forceListFail.add("u9/hub/bad.webp");

    const result = await relocateArtistGallery("u9");

    expect(result.ok).toBe(false);
    expect(result.moved).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failedPaths).toEqual(["u9/hub/bad.webp"]);
    // Still physically public — a false "already_done" here would have left
    // it exactly here while reporting success.
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].has("u9/hub/bad.webp")).toBe(true);
    expect(h.overrides.u9.gallery_relocated_at ?? null).toBeNull();
  });
});

describe("restoreArtistGallery", () => {
  it("no-ops when the artist was never archived, without touching storage", async () => {
    h.overrides.u6 = { artist_id: "u6", gallery_relocated_at: null };
    // Deliberately no profiles row for u6: if restore read it anyway this
    // would still resolve (parseBioPageSettings tolerates undefined), so the
    // real proof is the result shape and that nothing appears in either
    // bucket afterwards.
    const result = await restoreArtistGallery("u6");
    expect(result).toEqual({ ok: true, moved: 0, failed: 0, failedPaths: [] });
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].size).toBe(0);
    expect(h.buckets[GALLERY_ARCHIVE_BUCKET].size).toBe(0);
  });

  it("moves every object back to the public bucket and clears the marker", async () => {
    h.profiles.u7 = galleryProfile("u7", "a.webp");
    h.overrides.u7 = {
      artist_id: "u7",
      gallery_relocated_at: "2026-07-01T00:00:00.000Z",
    };
    h.buckets[GALLERY_ARCHIVE_BUCKET].add("u7/hub/a.webp");

    const result = await restoreArtistGallery("u7");

    expect(result).toEqual({ ok: true, moved: 1, failed: 0, failedPaths: [] });
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].has("u7/hub/a.webp")).toBe(true);
    expect(h.overrides.u7.gallery_relocated_at).toBeNull();
  });

  it("a half-failed restore leaves the marker set (still archived) for a retry", async () => {
    h.profiles.u8 = galleryProfile("u8", "ok.webp", "bad.webp");
    h.overrides.u8 = {
      artist_id: "u8",
      gallery_relocated_at: "2026-07-01T00:00:00.000Z",
    };
    h.buckets[GALLERY_ARCHIVE_BUCKET].add("u8/hub/ok.webp");
    h.buckets[GALLERY_ARCHIVE_BUCKET].add("u8/hub/bad.webp");
    h.forceFail.add("u8/hub/bad.webp");

    const result = await restoreArtistGallery("u8");

    expect(result.ok).toBe(false);
    expect(h.overrides.u8.gallery_relocated_at).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].has("u8/hub/ok.webp")).toBe(true);
    expect(h.buckets[GALLERY_ARCHIVE_BUCKET].has("u8/hub/bad.webp")).toBe(true);
  });

  it("does NOT clear the marker when the profile read fails during restore", async () => {
    // Symmetric to the relocate-side profile-read-failure test above. The
    // artist IS archived (gallery_relocated_at set), so moveAll runs and
    // calls ownedGalleryPaths, which is forced to fail here. Before the fix
    // this resolved to zero paths, `moved: 0`/`ok: true`, and the marker was
    // cleared — leaving the images stranded in the private archive bucket
    // while the account was recorded as fully restored.
    h.profiles.u8b = galleryProfile("u8b", "a.webp");
    h.overrides.u8b = {
      artist_id: "u8b",
      gallery_relocated_at: "2026-07-01T00:00:00.000Z",
    };
    h.buckets[GALLERY_ARCHIVE_BUCKET].add("u8b/hub/a.webp");
    h.forceProfileFail.add("u8b");

    const result = await restoreArtistGallery("u8b");

    expect(result).toEqual({ ok: false, moved: 0, failed: 0, failedPaths: [] });
    expect(h.overrides.u8b.gallery_relocated_at).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    // Untouched in storage too — still archived, still privately reachable.
    expect(h.buckets[GALLERY_ARCHIVE_BUCKET].has("u8b/hub/a.webp")).toBe(true);
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].has("u8b/hub/a.webp")).toBe(false);
    expect(h.captureException).toHaveBeenCalled();
  });
});

describe("galleryCurrentlyEntitled", () => {
  it("true for Plus, false for Free", () => {
    expect(galleryCurrentlyEntitled({ planTier: "plus" })).toBe(true);
    expect(galleryCurrentlyEntitled({ planTier: "free" })).toBe(false);
  });

  it("an explicit per-account override wins over the plan baseline", () => {
    expect(
      galleryCurrentlyEntitled({
        planTier: "free",
        entitlementOverrides: { rich_content_blocks: true },
      }),
    ).toBe(true);
    expect(
      galleryCurrentlyEntitled({
        planTier: "plus",
        entitlementOverrides: { rich_content_blocks: false },
      }),
    ).toBe(false);
  });

  it("an expired Plus comp resolves to unentitled", () => {
    expect(
      galleryCurrentlyEntitled({
        planTier: "plus",
        planExpiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("runGalleryRelocationSweep", () => {
  it("relocates an unentitled free artist not yet archived", async () => {
    h.overrides.a1 = { artist_id: "a1", plan_tier: "free" };
    h.profiles.a1 = galleryProfile("a1", "x.webp");
    h.buckets[GALLERY_PUBLIC_BUCKET].add("a1/hub/x.webp");

    const result = await runGalleryRelocationSweep();

    expect(result.relocated).toBe(1);
    expect(result.relocationsStillFailing).toBe(0);
    expect(h.overrides.a1.gallery_relocated_at).toBeTruthy();
    expect(h.buckets[GALLERY_ARCHIVE_BUCKET].has("a1/hub/x.webp")).toBe(true);
  });

  it("skips a free-tier artist who holds an explicit override granting the gallery", async () => {
    h.overrides.a2 = {
      artist_id: "a2",
      plan_tier: "free",
      entitlement_overrides: { rich_content_blocks: true },
    };
    h.profiles.a2 = galleryProfile("a2", "x.webp");
    h.buckets[GALLERY_PUBLIC_BUCKET].add("a2/hub/x.webp");

    const result = await runGalleryRelocationSweep();

    expect(result.relocated).toBe(0);
    expect(h.overrides.a2.gallery_relocated_at ?? null).toBeNull();
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].has("a2/hub/x.webp")).toBe(true);
  });

  it("restores a currently-entitled artist who is still marked archived", async () => {
    h.overrides.a3 = {
      artist_id: "a3",
      plan_tier: "plus",
      gallery_relocated_at: "2026-07-01T00:00:00.000Z",
    };
    h.profiles.a3 = galleryProfile("a3", "x.webp");
    h.buckets[GALLERY_ARCHIVE_BUCKET].add("a3/hub/x.webp");

    const result = await runGalleryRelocationSweep();

    expect(result.restored).toBe(1);
    expect(h.overrides.a3.gallery_relocated_at).toBeNull();
    expect(h.buckets[GALLERY_PUBLIC_BUCKET].has("a3/hub/x.webp")).toBe(true);
  });

  it("leaves an unentitled, already-archived artist alone (nothing to do in either direction)", async () => {
    h.overrides.a4 = {
      artist_id: "a4",
      plan_tier: "free",
      gallery_relocated_at: "2026-07-01T00:00:00.000Z",
    };

    const result = await runGalleryRelocationSweep();

    expect(result.relocated).toBe(0);
    expect(result.restored).toBe(0);
  });

  it("counts a still-failing candidate separately so it is visible without reading Sentry", async () => {
    h.overrides.a5 = { artist_id: "a5", plan_tier: "free" };
    h.profiles.a5 = galleryProfile("a5", "bad.webp");
    h.buckets[GALLERY_PUBLIC_BUCKET].add("a5/hub/bad.webp");
    h.forceFail.add("a5/hub/bad.webp");

    const result = await runGalleryRelocationSweep();

    expect(result.relocated).toBe(0);
    expect(result.relocationsStillFailing).toBe(1);
    expect(h.overrides.a5.gallery_relocated_at ?? null).toBeNull();
  });
});
