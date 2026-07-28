import { describe, it, expect, vi, beforeEach } from "vitest";

// Large-project server cores (Plus build P4). The guarantees under test:
// the public intake fails CLOSED, a downgrade never blocks work already in
// flight, and an illegal transition is refused rather than written.

const getAccountOverrides = vi.fn();
const largeProjectsAllowed = vi.fn();
const processImage = vi.fn();

const insertResult = { data: { id: "proj-1" }, error: null as unknown };
const projectRow = {
  id: "proj-1",
  artist_id: "artist-1",
  status: "submitted",
  decided_at: null,
};
let currentProject: Record<string, unknown> | null = projectRow;
let updateOutcome: { error: unknown; count: number } = {
  error: null,
  count: 1,
};
const projectInsert = vi.fn(() => ({
  select: () => ({ single: () => Promise.resolve(insertResult) }),
}));
const projectUpdate = vi.fn(() => ({
  eq: () => ({ eq: () => Promise.resolve(updateOutcome) }),
}));
const bookingUpdate = vi.fn(() => ({
  eq: () => ({ eq: () => Promise.resolve(updateOutcome) }),
}));
const projectDelete = vi.fn(() => ({ eq: () => Promise.resolve({}) }));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  largeProjectsAllowed: (...a: unknown[]) => largeProjectsAllowed(...a),
}));
vi.mock("@/lib/image-processing", () => ({
  processImage: (...a: unknown[]) => processImage(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => {
      if (table === "projects") {
        return {
          insert: projectInsert,
          update: projectUpdate,
          delete: projectDelete,
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: currentProject }),
              }),
            }),
          }),
        };
      }
      if (table === "booking_requests") return { update: bookingUpdate };
      return { insert: vi.fn(() => Promise.resolve({ error: null })) };
    },
    storage: {
      from: () => ({
        upload: vi.fn(() => Promise.resolve({ error: null })),
        remove: vi.fn(() => Promise.resolve({})),
        createSignedUrls: vi.fn(() =>
          Promise.resolve({ data: [], error: null }),
        ),
      }),
    },
  },
}));

import {
  submitProjectIntakeCore,
  setProjectStatusCore,
  linkBookingToProjectCore,
} from "@/lib/server/projects";

const validIntake = {
  title: "Full sleeve",
  description:
    "A full Japanese sleeve, starting at the shoulder and working down.",
  bodyAreas: ["full_sleeve"],
  scale: "sleeve",
  customerEmail: "client@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  getAccountOverrides.mockResolvedValue({});
  largeProjectsAllowed.mockReturnValue(true);
  currentProject = { ...projectRow };
  updateOutcome = { error: null, count: 1 };
});

describe("submitProjectIntakeCore", () => {
  it("creates a project for an entitled artist", async () => {
    const r = await submitProjectIntakeCore("artist-1", validIntake, []);
    expect(r).toEqual({ ok: true, projectId: "proj-1" });
  });

  it("refuses when the artist is not entitled", async () => {
    largeProjectsAllowed.mockReturnValue(false);
    const r = await submitProjectIntakeCore("artist-1", validIntake, []);
    expect(r.ok).toBe(false);
    expect(projectInsert).not.toHaveBeenCalled();
  });

  // Fail CLOSED here, unlike the public RENDER paths: creating a record the
  // artist may not be able to work with is worse than asking a visitor to
  // retry.
  it("fails closed on a plan-read blip", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const r = await submitProjectIntakeCore("artist-1", validIntake, []);
    expect(r.ok).toBe(false);
    expect(projectInsert).not.toHaveBeenCalled();
  });

  it("reports the offending field so the form can point at it", async () => {
    const r = await submitProjectIntakeCore(
      "artist-1",
      { ...validIntake, customerEmail: "not-an-email" },
      [],
    );
    expect(r).toMatchObject({ ok: false, field: "customerEmail" });
  });

  it("catches an inverted budget range", async () => {
    const r = await submitProjectIntakeCore(
      "artist-1",
      { ...validIntake, budgetMinCents: 80000, budgetMaxCents: 50000 },
      [],
    );
    expect(r).toMatchObject({ ok: false, field: "budgetMaxCents" });
  });

  // A half-uploaded set with no row pointing at it is storage cost forever.
  it("deletes the project when a photo fails, leaving nothing stranded", async () => {
    processImage.mockRejectedValue(new Error("bad image"));
    const file = new File([new Uint8Array([1, 2, 3])], "a.jpg", {
      type: "image/jpeg",
    });
    const r = await submitProjectIntakeCore("artist-1", validIntake, [file]);
    expect(r.ok).toBe(false);
    expect(projectDelete).toHaveBeenCalled();
  });
});

describe("setProjectStatusCore", () => {
  it("performs a legal transition", async () => {
    const r = await setProjectStatusCore("artist-1", "proj-1", "under_review");
    expect(r.ok).toBe(true);
    expect(projectUpdate).toHaveBeenCalled();
  });

  it("refuses an illegal one rather than writing it", async () => {
    currentProject = { ...projectRow, status: "declined" };
    const r = await setProjectStatusCore("artist-1", "proj-1", "active");
    expect(r).toMatchObject({ ok: false, code: "invalid_transition" });
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("refuses an unknown status", async () => {
    const r = await setProjectStatusCore("artist-1", "proj-1", "vibing");
    expect(r.ok).toBe(false);
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("treats a no-op as success without writing", async () => {
    const r = await setProjectStatusCore("artist-1", "proj-1", "submitted");
    expect(r.ok).toBe(true);
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("404s a project belonging to someone else", async () => {
    currentProject = null;
    const r = await setProjectStatusCore("artist-2", "proj-1", "under_review");
    expect(r).toMatchObject({ ok: false, code: "not_found" });
  });

  // The entitlement gates NEW projects only. An artist who downgrades must
  // still be able to finish or decline work that already has bookings on it.
  it("does not consult the entitlement at all", async () => {
    await setProjectStatusCore("artist-1", "proj-1", "under_review");
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });
});

describe("linkBookingToProjectCore", () => {
  it("links a booking to a project the artist owns", async () => {
    const r = await linkBookingToProjectCore("artist-1", "book-1", "proj-1");
    expect(r.ok).toBe(true);
  });

  it("refuses to link into a project the artist does not own", async () => {
    currentProject = null;
    const r = await linkBookingToProjectCore("artist-2", "book-1", "proj-1");
    expect(r).toMatchObject({ ok: false, code: "not_found" });
    expect(bookingUpdate).not.toHaveBeenCalled();
  });

  it("unlinks without needing a project lookup", async () => {
    const r = await linkBookingToProjectCore("artist-1", "book-1", null);
    expect(r.ok).toBe(true);
  });

  it("404s when the booking is not the artist's", async () => {
    updateOutcome = { error: null, count: 0 };
    const r = await linkBookingToProjectCore("artist-1", "book-x", null);
    expect(r).toMatchObject({ ok: false, code: "not_found" });
  });
});
