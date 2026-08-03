import { describe, it, expect, vi, beforeEach } from "vitest";

// Hosted gallery-image lifecycle (Track B slice B2): the path-ownership guard
// (a block's url is artist-supplied and may be external) and the save-diff
// orphan cleanup (row-first, object-second; losing writers never delete).

const { mockRemove, mockFrom, captureException } = vi.hoisted(() => ({
  mockRemove: vi.fn(),
  mockFrom: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    storage: {
      // Records WHICH bucket the removal targets. Before 0151 this mock
      // ignored the bucket entirely, which meant the suite would have stayed
      // green if the cleanup had kept deleting from the public `logos` bucket
      // after gallery objects moved to the private one — a silent no-op that
      // orphans every dropped object forever.
      from: (bucket: string) => {
        mockFrom(bucket);
        return { remove: (...a: unknown[]) => mockRemove(...a) };
      },
    },
  },
}));

import {
  ownedHubImagePath,
  removeDroppedHubImages,
} from "@/lib/server/hub-images";
import type { BioBlock } from "@inklee/shared/bio-page";

// 0151 (LO-5 DPIA R4): gallery objects live in the PRIVATE `gallery` bucket at
// the authenticated-object path, not the public `logos` one.
const BASE = "https://x.supabase.co/storage/v1/object/gallery";
/** The pre-0151 shape, kept as a named negative fixture below. */
const LEGACY_PUBLIC_BASE =
  "https://x.supabase.co/storage/v1/object/public/logos";

function gallery(id: string, urls: string[]): BioBlock {
  return {
    id,
    type: "image_gallery",
    layout: "grid",
    images: urls.map((url) => ({ url })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRemove.mockResolvedValue({ error: null });
});

describe("ownedHubImagePath", () => {
  it("accepts this artist's hub object and strips the query string", () => {
    expect(ownedHubImagePath(`${BASE}/u1/hub/a.webp`, "u1")).toBe(
      "u1/hub/a.webp",
    );
    expect(ownedHubImagePath(`${BASE}/u1/hub/a.webp?t=123`, "u1")).toBe(
      "u1/hub/a.webp",
    );
  });

  it("rejects everything that is not this artist's hub namespace", () => {
    // External URL (legitimate in a block, never a storage candidate).
    expect(ownedHubImagePath("https://example.com/a.jpg", "u1")).toBeNull();
    // Another artist's object.
    expect(ownedHubImagePath(`${BASE}/u2/hub/a.webp`, "u1")).toBeNull();
    // A sibling feature's object (the flash/cover namespaces are not ours).
    expect(ownedHubImagePath(`${BASE}/u1/flash/a.webp`, "u1")).toBeNull();
    expect(ownedHubImagePath(`${BASE}/u1/cover.webp`, "u1")).toBeNull();
    // Traversal + nested segments.
    expect(ownedHubImagePath(`${BASE}/u1/hub/../cover.webp`, "u1")).toBeNull();
    expect(ownedHubImagePath(`${BASE}/u1/hub/x/y.webp`, "u1")).toBeNull();
    // Empty tail.
    expect(ownedHubImagePath(`${BASE}/u1/hub/`, "u1")).toBeNull();
  });

  it("rejects the pre-0151 PUBLIC logos URL, so no public object is ever a gallery storage candidate", () => {
    // Deliberate, and the residual is documented rather than hidden: after
    // 0151 a legacy public-bucket URL is not a gallery object at all. It
    // cannot be signed, it is not cleaned up by the save diff, and
    // `sanitizeHostedGalleryImageUrl` refuses to persist one. This assertion
    // exists so that stays a decision rather than an accident: accepting the
    // public form here would let a hand-crafted block address a world-readable
    // object, which is exactly the R4 risk 0151 removes.
    expect(
      ownedHubImagePath(`${LEGACY_PUBLIC_BASE}/u1/hub/a.webp`, "u1"),
    ).toBeNull();
  });
});

describe("removeDroppedHubImages", () => {
  it("removes exactly the dropped HOSTED objects, never kept or external ones", async () => {
    const prior = [
      gallery("g1", [
        `${BASE}/u1/hub/kept.webp`,
        `${BASE}/u1/hub/dropped.webp`,
        "https://example.com/external.jpg", // dropped but external
        `${BASE}/u2/hub/foreign.webp`, // dropped but not ours
      ]),
    ];
    const saved = [gallery("g1", [`${BASE}/u1/hub/kept.webp`])];

    const removed = await removeDroppedHubImages("u1", prior, saved);
    expect(removed).toBe(1);
    expect(mockRemove).toHaveBeenCalledWith(["u1/hub/dropped.webp"]);
    // ...from the PRIVATE bucket. Deleting the right path out of the wrong
    // bucket succeeds silently and removes nothing.
    expect(mockFrom).toHaveBeenCalledWith("gallery");
    expect(mockFrom).not.toHaveBeenCalledWith("logos");
  });

  it("counts a URL kept in ANOTHER block as kept (no cross-block deletion)", async () => {
    const url = `${BASE}/u1/hub/shared.webp`;
    const prior = [gallery("g1", [url])];
    const saved = [gallery("g2", [url])]; // moved between blocks
    const removed = await removeDroppedHubImages("u1", prior, saved);
    expect(removed).toBe(0);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("no-ops when nothing hosted was dropped", async () => {
    const prior = [gallery("g1", ["https://example.com/a.jpg"])];
    const removed = await removeDroppedHubImages("u1", prior, []);
    expect(removed).toBe(0);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("fails soft on a storage error (sweepable orphan, captured, returns 0)", async () => {
    mockRemove.mockResolvedValue({ error: { message: "boom" } });
    const prior = [gallery("g1", [`${BASE}/u1/hub/a.webp`])];
    const removed = await removeDroppedHubImages("u1", prior, []);
    expect(removed).toBe(0);
    expect(captureException).toHaveBeenCalled();
  });
});
