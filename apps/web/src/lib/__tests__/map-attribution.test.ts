import { describe, it, expect } from "vitest";

import {
  DATA_ATTRIBUTION_PATH,
  DIRECTORY_SOURCES,
  FOURSQUARE_NOTICE,
  NEVER_PUBLISHED_FROM_SOURCES,
  PUBLISHED_SEED_FIELDS,
  STUDIO_DATA_CREDIT,
} from "@inklee/shared/map-attribution";
import { MARKETING_ROUTES } from "@/lib/marketing-routes";
import { isReservedSlug } from "@inklee/shared/slug";
import { getVendoredLicenses } from "@/lib/licenses";

/**
 * Guards the studio-data attribution required before any seeded row is public.
 *
 * The wording is not cosmetic. The 2026-07-24 counsel answer approved a credit
 * line that OMITTED OpenStreetMap, on the premise that no studio rows were
 * OSM-derived. That premise was false: 3,582 approved studios come solely from
 * a direct OSM Overpass lane. Counsel re-confirmed attribution-only on the
 * corrected facts 2026-07-26 with OSM restored. Shipping the older string would
 * publish those rows with no ODbL credit, so the presence of all three sources
 * is asserted here rather than left to review.
 *
 * See docs/counsel-note-public-map-osm-correction-2026-07-26.md.
 */

describe("studio-data credit line", () => {
  it("names all three upstream sources", () => {
    expect(STUDIO_DATA_CREDIT).toContain("OpenStreetMap contributors");
    expect(STUDIO_DATA_CREDIT).toContain("Overture Maps Foundation");
    expect(STUDIO_DATA_CREDIT).toContain("Foursquare Labs, Inc.");
  });

  it("names each licence", () => {
    expect(STUDIO_DATA_CREDIT).toContain("ODbL");
    expect(STUDIO_DATA_CREDIT).toContain("CDLA-Permissive-2.0");
    expect(STUDIO_DATA_CREDIT).toContain("Apache-2.0");
  });

  it("carries the Apache-2.0 statement of changes", () => {
    expect(STUDIO_DATA_CREDIT).toContain("modified by Inklee");
  });

  it("preserves the Foursquare NOTICE copyright line", () => {
    expect(FOURSQUARE_NOTICE).toBe(
      "Copyright 2024 Foursquare Labs, Inc. All rights reserved.",
    );
  });

  it("uses no em-dash (visible copy rule)", () => {
    expect(STUDIO_DATA_CREDIT).not.toContain("—");
    expect(FOURSQUARE_NOTICE).not.toContain("—");
  });
});

describe("directory source table", () => {
  it("lists exactly the three credited sources", () => {
    expect(DIRECTORY_SOURCES.map((s) => s.key).sort()).toEqual([
      "foursquare",
      "openstreetmap",
      "overture",
    ]);
  });

  it("gives every source a licence and a resolvable https licence link", () => {
    for (const source of DIRECTORY_SOURCES) {
      expect(source.licence.length).toBeGreaterThan(0);
      expect(source.licenceUrl.startsWith("https://")).toBe(true);
      expect(source.homeUrl.startsWith("https://")).toBe(true);
    }
  });

  it("every source in the table is credited in the credit line", () => {
    for (const source of DIRECTORY_SOURCES) {
      // Compare on the licence identifier without its version suffix: the table
      // is precise ("ODbL 1.0") while counsel's approved credit is the common
      // short form ("ODbL"). The credit wording is fixed and must not be edited
      // to satisfy a test.
      const identifier = source.licence.split(" ")[0];
      expect(STUDIO_DATA_CREDIT).toContain(identifier);
    }
  });
});

describe("published-field policy", () => {
  it("publishes only facts", () => {
    expect(PUBLISHED_SEED_FIELDS.length).toBe(3);
    const joined = PUBLISHED_SEED_FIELDS.join(" ").toLowerCase();
    expect(joined).toContain("name");
    expect(joined).toContain("city");
  });

  it("keeps source-authored content out", () => {
    const joined = NEVER_PUBLISHED_FROM_SOURCES.join(" ").toLowerCase();
    for (const banned of ["photo", "rating", "opening hours", "description"]) {
      expect(joined).toContain(banned);
    }
  });
});

describe("vendored licence texts", () => {
  // Apache-2.0 4(a) wants recipients given a copy of the licence; CDLA-2.0 2.1
  // wants the agreement text made available with shared Data. These files are
  // downloaded, never written by hand, so the assertions below check the
  // upstream text is present and whole rather than checking prose we authored.
  const licenses = getVendoredLicenses();

  it("vendors exactly the two licences that require a copy", () => {
    expect(licenses.map((l) => l.id).sort()).toEqual([
      "apache-2.0",
      "cdla-permissive-2.0",
    ]);
  });

  it("does not vendor ODbL", () => {
    // Counsel confirmed 2026-07-26 that a Produced Work owes attribution plus
    // an indication of the licence, not a copy. Adding one is not harmful, but
    // it should be a decision rather than a reflex, so this pins the position.
    expect(licenses.some((l) => l.id.includes("odbl"))).toBe(false);
  });

  it("serves the Apache-2.0 text whole", () => {
    const apache = licenses.find((l) => l.id === "apache-2.0");
    expect(apache).toBeDefined();
    expect(apache!.text).toContain("Apache License");
    expect(apache!.text).toContain("Version 2.0, January 2004");
    expect(apache!.text).toContain("TERMS AND CONDITIONS FOR USE");
    // The appendix is the last block upstream: its presence proves the file
    // was not truncated somewhere in the middle.
    expect(apache!.text).toContain("APPENDIX: How to apply the Apache License");
    expect(apache!.text.length).toBeGreaterThan(10_000);
  });

  it("serves the CDLA-Permissive-2.0 text whole", () => {
    const cdla = licenses.find((l) => l.id === "cdla-permissive-2.0");
    expect(cdla).toBeDefined();
    expect(cdla!.text).toContain(
      "Community Data License Agreement - Permissive - Version 2.0",
    );
    // Section 2.1 is the clause that makes vendoring necessary at all.
    expect(cdla!.text).toContain(
      "makes available the text of this agreement with the shared Data",
    );
    // 5.4 is the final definition upstream.
    expect(cdla!.text).toContain("5.4.");
    expect(cdla!.text.length).toBeGreaterThan(2_000);
  });
});

describe("/data-attribution route", () => {
  it("is reserved so no artist can claim the slug", () => {
    expect(isReservedSlug("data-attribution")).toBe(true);
  });

  it("stays out of the sitemap while the public map is dark", () => {
    // It is gated on publicMapEnabled() and 404s otherwise, so it must not be
    // advertised to crawlers or pushed to IndexNow yet.
    expect(MARKETING_ROUTES.map((r) => r.path)).not.toContain(
      DATA_ATTRIBUTION_PATH,
    );
  });
});
