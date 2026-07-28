import { describe, it, expect, vi, beforeEach } from "vitest";

// Renaming the public URL (Plus build P3e). What matters: the claim path stays
// free, a change is gated, the availability check uses service-role truth, and
// the unique constraint is respected as the real arbiter.

const getAccountOverrides = vi.fn();
const formCustomAllowed = vi.fn();
const resolveSlugAvailabilityServer = vi.fn();
const writeAudit = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  formCustomAllowed: (...a: unknown[]) => formCustomAllowed(...a),
}));
vi.mock("@/lib/server/slug-availability", () => ({
  resolveSlugAvailabilityServer: (...a: unknown[]) =>
    resolveSlugAvailabilityServer(...a),
}));
vi.mock("@/lib/audit", () => ({
  writeAudit: (...a: unknown[]) => writeAudit(...a),
}));

import { renameSlugCore } from "@/lib/server/slug-rename";

/** Minimal supabase double: one profiles read and one profiles update. */
function client(currentSlug: string | null, updateError: unknown = null) {
  const update = vi.fn(() => ({
    eq: () => Promise.resolve({ error: updateError }),
  }));
  return {
    update,
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: { slug: currentSlug }, error: null }),
        }),
      }),
      update,
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (c: ReturnType<typeof client>) => c as any;

beforeEach(() => {
  vi.clearAllMocks();
  getAccountOverrides.mockResolvedValue({});
  formCustomAllowed.mockReturnValue(true);
  resolveSlugAvailabilityServer.mockResolvedValue({
    available: true,
    owned: false,
  });
});

describe("renameSlugCore", () => {
  it("rejects an invalid slug before touching the database", async () => {
    const c = client("old-name");
    const r = await renameSlugCore(as(c), "a1", "No Spaces Here");
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(c.update).not.toHaveBeenCalled();
  });

  it("rejects a reserved slug", async () => {
    const r = await renameSlugCore(as(client("old-name")), "a1", "admin");
    expect(r).toMatchObject({ ok: false, code: "invalid" });
  });

  it("reports an unchanged slug without consulting the plan", async () => {
    const r = await renameSlugCore(as(client("same-name")), "a1", "same-name");
    expect(r).toMatchObject({ ok: false, code: "unchanged" });
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });

  // An artist with no slug yet is CLAIMING, which onboarding does for free.
  it("does not gate the first claim", async () => {
    formCustomAllowed.mockReturnValue(false);
    const c = client(null);
    const r = await renameSlugCore(as(c), "a1", "brand-new");
    expect(r).toMatchObject({ ok: true, slug: "brand-new" });
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });

  it("gates an actual rename", async () => {
    formCustomAllowed.mockReturnValue(false);
    const c = client("old-name");
    const r = await renameSlugCore(as(c), "a1", "new-name");
    expect(r).toMatchObject({ ok: false, code: "not_entitled" });
    expect(c.update).not.toHaveBeenCalled();
  });

  it("refuses on a plan-read blip rather than writing", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const c = client("old-name");
    const r = await renameSlugCore(as(c), "a1", "new-name");
    expect(r).toMatchObject({ ok: false, code: "failed" });
    expect(c.update).not.toHaveBeenCalled();
  });

  it("refuses a taken slug", async () => {
    resolveSlugAvailabilityServer.mockResolvedValue({
      available: false,
      owned: false,
    });
    const r = await renameSlugCore(as(client("old-name")), "a1", "taken-name");
    expect(r).toMatchObject({ ok: false, code: "taken" });
  });

  // The read above and the write below are not atomic, so the constraint is
  // what actually decides who gets the name.
  it("maps a unique violation to taken, not to a generic failure", async () => {
    const c = client("old-name", { code: "23505" });
    const r = await renameSlugCore(as(c), "a1", "raced-name");
    expect(r).toMatchObject({ ok: false, code: "taken" });
  });

  it("normalizes case and whitespace", async () => {
    const c = client("old-name");
    const r = await renameSlugCore(as(c), "a1", "  New-Name  ");
    expect(r).toMatchObject({ ok: true, slug: "new-name" });
  });

  it("audits the change with both names", async () => {
    await renameSlugCore(as(client("old-name")), "a1", "new-name");
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "profile_slug_renamed",
        details: { from: "old-name", to: "new-name" },
      }),
    );
  });
});
