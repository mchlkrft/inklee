// The segment allowlist: the lifecycle trigger segments are registered, the resolver
// refuses unknown keys before touching any query, and beta_artists stays a non-sendable
// (empty) audience. The service client is mocked; nothing here reaches a database.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ serviceClient: {} }));

import {
  KNOWN,
  resolveSegmentArtists,
} from "@/lib/email-campaigns/resolve-segment";

const LIFECYCLE_TRIGGER_KEYS = [
  "new_signups",
  "setup_incomplete_day_1",
  "setup_incomplete_day_3",
  "setup_incomplete_day_7",
  "no_requests_day_7",
  "no_requests_day_14",
  "no_requests_day_30",
  "inactive_day_14",
  "inactive_day_30",
  "inactive_day_60",
  "first_booking_recent",
  "books_open_recent",
  "guest_spot_recent",
];

describe("segment allowlist", () => {
  it("contains the 15 original keys plus the 13 lifecycle trigger segments", () => {
    expect(KNOWN.size).toBe(28);
    for (const key of LIFECYCLE_TRIGGER_KEYS) {
      expect(KNOWN.has(key), key).toBe(true);
    }
  });

  it("the resolver throws on an unknown key before any query runs", async () => {
    await expect(resolveSegmentArtists("not_a_segment")).rejects.toThrow(
      "unknown segment",
    );
  });

  it("beta_artists resolves to an empty, non-sendable audience", async () => {
    await expect(resolveSegmentArtists("beta_artists")).resolves.toEqual([]);
  });
});
