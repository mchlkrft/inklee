import { describe, it, expect, vi } from "vitest";

/**
 * S3/D3 forward guard: a private studio entering through the admin/seed lane
 * is never stored with its exact display position or street address (locked
 * scope rule: "a private studio cannot be shown at its exact map position").
 * Measured 2026-07-27: zero approved unclaimed private_studio rows existed in
 * prod, so this writer guard plus the read-model guard IS the remediation.
 */

vi.mock("@/lib/supabase/service", () => ({ serviceClient: {} }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/server/map-settings", () => ({
  getSeedCapPerBucket: vi.fn(async () => null),
}));
vi.mock("@/lib/server/map-duplicates", () => ({
  persistDuplicateSuggestions: vi.fn(),
  scanForDuplicates: vi.fn(async () => []),
}));

import { locationRowFromInput } from "@/lib/server/map-locations";

const BASE = {
  source: "inklee_seed" as const,
  name: "Quiet Needle",
  latitude: 52.52,
  longitude: 13.405,
  address: "Privatweg 5",
  city: "Berlin",
  country: "DE",
  postalCode: "10115",
  googlePlaceId: null,
  websiteUrl: null,
  instagramHandle: null,
  phone: null,
  openingHours: null,
  moderationStatus: "approved" as const,
  isSeed: true,
};

describe("locationRowFromInput private-studio guard", () => {
  it("offsets the display position and withholds address fields for private studios", () => {
    const row = locationRowFromInput(
      { ...BASE, category: "private_studio" },
      "bucket-1",
    ) as Record<string, unknown>;
    expect(row.latitude).toBe(52.52);
    expect(row.longitude).toBe(13.405);
    expect(row.display_latitude).not.toBe(52.52);
    expect(row.display_longitude).not.toBe(13.405);
    // The offset stays coarse but bounded (roughly 250 to 450 meters).
    expect(
      Math.abs((row.display_latitude as number) - 52.52),
    ).toBeLessThanOrEqual(0.006);
    expect(row.address).toBeNull();
    expect(row.postal_code).toBeNull();
    expect(row.city).toBe("Berlin");
  });

  it("is deterministic: the same input never wanders", () => {
    const a = locationRowFromInput(
      { ...BASE, category: "private_studio" },
      "bucket-1",
    ) as Record<string, unknown>;
    const b = locationRowFromInput(
      { ...BASE, category: "private_studio" },
      "bucket-1",
    ) as Record<string, unknown>;
    expect(a.display_latitude).toBe(b.display_latitude);
    expect(a.display_longitude).toBe(b.display_longitude);
  });

  it("leaves every other category at its true position with its address", () => {
    const row = locationRowFromInput(
      { ...BASE, category: "tattoo_studio" },
      "bucket-1",
    ) as Record<string, unknown>;
    expect(row.display_latitude).toBe(52.52);
    expect(row.display_longitude).toBe(13.405);
    expect(row.address).toBe("Privatweg 5");
    expect(row.postal_code).toBe("10115");
  });
});
