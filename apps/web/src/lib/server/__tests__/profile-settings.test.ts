import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mergeProfileSettings,
  updateProfileSettings,
} from "@/lib/server/profile-settings";

// Mechanism-wide sweep structural fix: `profiles.settings` is JSONB that
// Postgres REPLACES wholesale on update. The pre-existing shape at 12+ call
// sites — `const { data } = await ...single()`, `data?.settings ?? {}`, then
// write — could not tell a failed read from a genuinely new profile, so a
// transient failure collapsed the merge base to `{}` and the write then
// persisted an object with only the ONE key being changed, silently
// discarding every sibling setting. This file proves the replacement: a
// caller can only ever obtain a merge base after a successful read (the
// FAILURE case never invokes `merge` at all), and a genuinely absent
// settings column still resolves to the same empty-base behaviour every
// existing call site already relied on (the DISTINCTION case).

type Reply = { data: unknown; error: unknown };

function fakeSupabase(reply: Reply) {
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(reply),
      }),
    }),
    update: (payload: unknown) => ({
      eq: () => {
        updateCalls.push(payload);
        return Promise.resolve({ error: null });
      },
    }),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
}

let updateCalls: unknown[] = [];

describe("mergeProfileSettings", () => {
  it("FAILURE: a read error never invokes merge, and returns ok:false", async () => {
    const merge = vi.fn((current: Record<string, unknown>) => current);
    const supabase = fakeSupabase({
      data: null,
      error: { message: "connection reset" },
    });

    const result = await mergeProfileSettings(supabase, "artist_1", merge);

    expect(result).toEqual({
      ok: false,
      error: "Could not read your current settings. Please try again.",
    });
    // The whole point: merge is never called with a stand-in value on a
    // failed read. If this were called with anything (even `{}`), the
    // caller could not tell "read failed" from "genuinely nothing here".
    expect(merge).not.toHaveBeenCalled();
  });

  it("DISTINCTION: a genuinely absent settings row (no error) merges onto an empty base, same as before", async () => {
    const supabase = fakeSupabase({ data: { settings: null }, error: null });

    const result = await mergeProfileSettings(
      supabase,
      "artist_1",
      (current) => ({ ...current, some_key: "value" }),
    );

    expect(result).toEqual({
      ok: true,
      settings: { some_key: "value" },
    });
  });

  it("a genuinely absent profile row (maybeSingle returns null data, no error) also merges onto an empty base", async () => {
    const supabase = fakeSupabase({ data: null, error: null });

    const result = await mergeProfileSettings(
      supabase,
      "artist_1",
      (current) => ({ ...current, some_key: "value" }),
    );

    expect(result).toEqual({ ok: true, settings: { some_key: "value" } });
  });

  it("hands the REAL current settings to merge when the read succeeds with data", async () => {
    const supabase = fakeSupabase({
      data: { settings: { existing_key: "preserved", books_open: false } },
      error: null,
    });

    const result = await mergeProfileSettings(
      supabase,
      "artist_1",
      (current) => ({
        ...current,
        new_key: "added",
      }),
    );

    expect(result).toEqual({
      ok: true,
      settings: {
        existing_key: "preserved",
        books_open: false,
        new_key: "added",
      },
    });
  });

  it("supports an async merge callback (the createFieldAction shape, which queries a second table)", async () => {
    const supabase = fakeSupabase({ data: { settings: {} }, error: null });

    const result = await mergeProfileSettings(
      supabase,
      "artist_1",
      async (current) => {
        await Promise.resolve();
        return { ...current, field_order: ["a", "b"] };
      },
    );

    expect(result).toEqual({ ok: true, settings: { field_order: ["a", "b"] } });
  });
});

describe("updateProfileSettings", () => {
  beforeEach(() => {
    updateCalls = [];
  });

  it("FAILURE: never writes when the read fails", async () => {
    const supabase = fakeSupabase({
      data: null,
      error: { message: "connection reset" },
    });

    const result = await updateProfileSettings(
      supabase,
      "artist_1",
      (current) => ({
        ...current,
        books_open: true,
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not read your current settings. Please try again.",
    });
    expect(updateCalls).toHaveLength(0);
  });

  it("writes the merged settings (plus any extraColumns) on a successful read", async () => {
    const supabase = fakeSupabase({
      data: { settings: { existing_key: "preserved" } },
      error: null,
    });

    const result = await updateProfileSettings(
      supabase,
      "artist_1",
      (current) => ({ ...current, new_key: "added" }),
      { updated_at: "2026-08-02T00:00:00.000Z" },
    );

    expect(result).toEqual({ ok: true });
    expect(updateCalls).toEqual([
      {
        settings: { existing_key: "preserved", new_key: "added" },
        updated_at: "2026-08-02T00:00:00.000Z",
      },
    ]);
  });

  it("propagates a write failure as ok:false", async () => {
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { settings: {} }, error: null }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: { message: "write failed" } }),
      }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from } as any;

    const result = await updateProfileSettings(supabase, "artist_1", (c) => c);

    expect(result).toEqual({ ok: false, error: "write failed" });
  });
});
