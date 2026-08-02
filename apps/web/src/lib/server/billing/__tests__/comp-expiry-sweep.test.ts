import { describe, it, expect, vi, beforeEach } from "vitest";

// Comp-expiry sweep: the SECOND of the two named C1.5 entitlement-change
// hooks (docs/legal/counsel-accountant-handoff-2026-08.md Part 4). Unlike the
// billing reconcile, a comp lapse is never written to the DB as a discrete
// event — `effectivePlanTier` computes it live — so the ONLY once-per-lapse
// signal in the system is this sweep's own notification idempotency guard.
// These tests prove gallery relocation rides that SAME guard rather than
// firing on every sweep run while a comp stays expired.

const {
  createNotification,
  sendEmail,
  captureException,
  relocateArtistGallery,
  getUserById,
} = vi.hoisted(() => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  captureException: vi.fn(),
  relocateArtistGallery: vi
    .fn()
    .mockResolvedValue({ ok: true, moved: 0, failed: 0, failedPaths: [] }),
  getUserById: vi
    .fn()
    .mockResolvedValue({ data: { user: { email: "a@x.com" } } }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock("@/lib/email/booking-templates", () => ({
  buildEmailHtml: (body: string) => `<p>${body}</p>`,
}));
// galleryCurrentlyEntitled stays REAL (pure) via importActual; only
// relocateArtistGallery is a spy, so this file proves WIRING (called once,
// with the right artist, gated on the real entitlement check), not
// gallery-relocation.ts's own storage logic (covered in
// gallery-relocation.test.ts).
vi.mock("@/lib/server/gallery-relocation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/server/gallery-relocation")
  >("@/lib/server/gallery-relocation");
  return {
    ...actual,
    relocateArtistGallery: (...a: unknown[]) => relocateArtistGallery(...a),
  };
});

type Reply = { data?: unknown; error?: unknown; count?: unknown };
let compsReply: Reply = { data: [], error: null };
let notificationCountReply: Reply = { count: 0 };

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => {
      if (table === "account_overrides") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          not: () => chain,
          lte: () => chain,
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(compsReply).then(res, rej),
        };
        return chain;
      }
      if (table === "notifications") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          contains: () => chain,
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(notificationCountReply).then(res, rej),
        };
        return chain;
      }
      throw new Error(`unexpected table: ${table}`);
    },
    auth: { admin: { getUserById: (id: string) => getUserById(id) } },
  },
}));

import { runCompExpirySweep } from "@/lib/server/billing/comp-expiry-sweep";

function comp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    artist_id: "artist1",
    plan_tier: "plus",
    plan_source: "comp",
    plan_expires_at: "2020-01-01T00:00:00.000Z", // in the past => expired
    entitlement_overrides: {},
    gallery_relocated_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createNotification.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue(undefined);
  relocateArtistGallery.mockResolvedValue({
    ok: true,
    moved: 0,
    failed: 0,
    failedPaths: [],
  });
  getUserById.mockResolvedValue({ data: { user: { email: "a@x.com" } } });
  compsReply = { data: [], error: null };
  notificationCountReply = { count: 0 };
});

describe("runCompExpirySweep — C1.5 gallery relocation hook", () => {
  it("relocates the gallery exactly once when a comp lapse is freshly notified", async () => {
    compsReply = { data: [comp()], error: null };
    notificationCountReply = { count: 0 }; // not yet notified this month

    const result = await runCompExpirySweep();

    expect(result.expiredNotified).toBe(1);
    expect(relocateArtistGallery).toHaveBeenCalledTimes(1);
    expect(relocateArtistGallery).toHaveBeenCalledWith("artist1");
  });

  it("does NOT relocate again once the lapse was already notified (idempotency guard)", async () => {
    compsReply = { data: [comp()], error: null };
    notificationCountReply = { count: 1 }; // already notified this month

    await runCompExpirySweep();

    expect(createNotification).not.toHaveBeenCalled();
    expect(relocateArtistGallery).not.toHaveBeenCalled();
  });

  it("does not relocate when the artist holds an override granting the gallery despite the expired comp", async () => {
    compsReply = {
      data: [comp({ entitlement_overrides: { rich_content_blocks: true } })],
      error: null,
    };
    notificationCountReply = { count: 0 };

    await runCompExpirySweep();

    expect(relocateArtistGallery).not.toHaveBeenCalled();
  });

  it("does not relocate for a WARNING (not yet expired) notice", async () => {
    compsReply = {
      data: [
        comp({
          plan_expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        }),
      ],
      error: null,
    };
    notificationCountReply = { count: 0 };

    const result = await runCompExpirySweep();

    expect(result.warningsSent).toBe(1);
    expect(relocateArtistGallery).not.toHaveBeenCalled();
  });

  it("a relocation failure is isolated: the sweep still counts the notification and moves on", async () => {
    relocateArtistGallery.mockResolvedValue({
      ok: false,
      moved: 0,
      failed: 1,
      failedPaths: ["artist1/hub/a.webp"],
    });
    compsReply = { data: [comp()], error: null };
    notificationCountReply = { count: 0 };

    const result = await runCompExpirySweep();

    expect(result.expiredNotified).toBe(1);
    expect(result.errors).toBe(0);
    expect(relocateArtistGallery).toHaveBeenCalledTimes(1);
  });
});
