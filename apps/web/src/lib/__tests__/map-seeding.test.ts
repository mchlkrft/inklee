import { describe, expect, it } from "vitest";
import {
  BRAVE_SEARCH_DAILY_CAP,
  BRAVE_SEARCH_MONTHLY_CAP,
  MAX_CANDIDATES_PER_RUN,
  SEED_CANDIDATE_SOURCES,
  SEED_CANDIDATE_SOURCE_LABELS,
  SEED_CANDIDATE_STATUSES,
  SEED_CANDIDATE_STATUS_LABELS,
  SEED_CANDIDATE_TYPES,
  SEED_CANDIDATE_TYPE_LABELS,
  CONVERTIBLE_CANDIDATE_TYPES,
  canTransitionSeedCandidate,
  instagramHandleFromSeedUrl,
  isHttpsSeedUrl,
  parseOvertureImport,
  shapeBraveResults,
  usageDayKey,
  usageMonthKey,
  validateManualCandidateInput,
  validateSeedAreaInput,
} from "@inklee/shared/map-seeding";
import { MAP_LOCATION_CATEGORIES } from "@inklee/shared/map-directory";

describe("vocabularies", () => {
  it("labels cover every value", () => {
    for (const s of SEED_CANDIDATE_SOURCES)
      expect(SEED_CANDIDATE_SOURCE_LABELS[s]).toBeTruthy();
    for (const s of SEED_CANDIDATE_STATUSES)
      expect(SEED_CANDIDATE_STATUS_LABELS[s]).toBeTruthy();
    for (const t of SEED_CANDIDATE_TYPES)
      expect(SEED_CANDIDATE_TYPE_LABELS[t]).toBeTruthy();
  });

  it("convertible types are exactly the map category vocabulary", () => {
    expect([...CONVERTIBLE_CANDIDATE_TYPES].sort()).toEqual(
      [...MAP_LOCATION_CATEGORIES].sort(),
    );
    expect(CONVERTIBLE_CANDIDATE_TYPES).not.toContain("tattoo_artist");
    expect(CONVERTIBLE_CANDIDATE_TYPES).not.toContain("uncertain");
  });

  it("brave caps sit inside the founder's budget wall", () => {
    // Founder budget 2026-07-20: ~EUR 5 free credit (~1,050 requests at the
    // observed ~$0.0051 each) plus a EUR 10 out-of-pocket ceiling. The hard
    // stop must keep worst-case out-of-pocket clearly under that ceiling:
    // cap * $0.0051 - $5.40 free <= ~$8 (EUR ~7.3) leaves real margin.
    const worstCaseUsd = BRAVE_SEARCH_MONTHLY_CAP * 0.0051;
    expect(worstCaseUsd - 5.4).toBeLessThanOrEqual(8);
    expect(BRAVE_SEARCH_DAILY_CAP).toBeLessThanOrEqual(
      BRAVE_SEARCH_MONTHLY_CAP,
    );
  });
});

describe("candidate transitions", () => {
  it("converted is terminal, rejected can reopen", () => {
    expect(canTransitionSeedCandidate("converted", "new")).toBe(false);
    expect(canTransitionSeedCandidate("converted", "rejected")).toBe(false);
    expect(canTransitionSeedCandidate("rejected", "new")).toBe(true);
    expect(canTransitionSeedCandidate("rejected", "converted")).toBe(false);
  });

  it("open states can convert and reject", () => {
    for (const from of [
      "new",
      "likely_duplicate",
      "approved_for_enrichment",
    ] as const) {
      expect(canTransitionSeedCandidate(from, "converted")).toBe(true);
      expect(canTransitionSeedCandidate(from, "rejected")).toBe(true);
    }
  });

  it("unknown states go nowhere", () => {
    expect(canTransitionSeedCandidate("nonsense", "rejected")).toBe(false);
  });
});

describe("validateSeedAreaInput", () => {
  const valid = {
    label: "Chiang Mai old town",
    city: "Chiang Mai",
    country: "Thailand",
    centerLat: 18.7883,
    centerLng: 98.9853,
    radiusKm: 15,
  };

  it("accepts a valid area", () => {
    expect(validateSeedAreaInput(valid)).toBeNull();
  });

  it("rejects missing label, bad coordinates, bad radius", () => {
    expect(validateSeedAreaInput({ ...valid, label: " " })).toMatch(/label/);
    expect(validateSeedAreaInput({ ...valid, centerLat: 91 })).toMatch(
      /latitude/i,
    );
    expect(validateSeedAreaInput({ ...valid, centerLng: -181 })).toMatch(
      /longitude/i,
    );
    expect(validateSeedAreaInput({ ...valid, radiusKm: 0 })).toMatch(/Radius/);
    expect(validateSeedAreaInput({ ...valid, radiusKm: 501 })).toMatch(
      /Radius/,
    );
  });
});

describe("validateManualCandidateInput", () => {
  const valid = {
    sourceUrl: "https://instagram.com/somestudio",
    name: "Some Studio",
    candidateType: "tattoo_studio",
  };

  it("accepts a valid manual entry", () => {
    expect(validateManualCandidateInput(valid)).toBeNull();
  });

  it("requires an https link and a name", () => {
    expect(validateManualCandidateInput({ ...valid, sourceUrl: "" })).toMatch(
      /link/,
    );
    expect(
      validateManualCandidateInput({
        ...valid,
        sourceUrl: "http://instagram.com/x",
      }),
    ).toMatch(/https/);
    expect(
      validateManualCandidateInput({
        ...valid,
        sourceUrl: "javascript:alert(1)",
      }),
    ).toMatch(/https/);
    expect(validateManualCandidateInput({ ...valid, name: " " })).toMatch(
      /name/,
    );
  });

  it("rejects unknown types and out-of-range confidence", () => {
    expect(
      validateManualCandidateInput({ ...valid, candidateType: "whatever" }),
    ).toMatch(/type/);
    expect(
      validateManualCandidateInput({ ...valid, confidenceScore: 101 }),
    ).toMatch(/Confidence/);
  });
});

describe("parseOvertureImport", () => {
  const row = {
    id: "08f2aa",
    name: "Sak Yant House",
    latitude: 18.79,
    longitude: 98.98,
    category: "tattoo_parlor",
  };

  it("parses a plain array and a wrapped object", () => {
    const a = parseOvertureImport(JSON.stringify([row]));
    expect("candidates" in a && a.candidates).toHaveLength(1);
    const b = parseOvertureImport(JSON.stringify({ candidates: [row] }));
    expect("candidates" in b && b.candidates).toHaveLength(1);
  });

  it("passes through the schema v3 contact fields and bounds the extra envelope", () => {
    const enriched = {
      ...row,
      address: "Ragang Rd 14",
      postalCode: "50100",
      phone: "+66 894 299 363",
      openingHours: "Mo-Su 11:00-20:00",
      extra: {
        email: "hi@studio.example",
        junk: 42,
        "": "dropped",
        long: "x".repeat(900),
      },
    };
    const parsed = parseOvertureImport(JSON.stringify([enriched]));
    if (!("candidates" in parsed)) throw new Error("expected candidates");
    const c = parsed.candidates[0];
    expect(c.address).toBe("Ragang Rd 14");
    expect(c.postalCode).toBe("50100");
    expect(c.phone).toBe("+66 894 299 363");
    expect(c.openingHours).toBe("Mo-Su 11:00-20:00");
    expect(c.extra?.email).toBe("hi@studio.example");
    expect(c.extra?.junk).toBeUndefined();
    expect(c.extra?.long?.length).toBe(500);
    // Old files without the fields still parse (backward compatible).
    const plain = parseOvertureImport(JSON.stringify([row]));
    if (!("candidates" in plain)) throw new Error("expected candidates");
    expect(plain.candidates[0].address).toBeNull();
    expect(plain.candidates[0].extra).toBeNull();
  });

  it("fails closed on malformed rows and bad JSON", () => {
    expect("error" in parseOvertureImport("not json")).toBe(true);
    expect("error" in parseOvertureImport("{}")).toBe(true);
    expect("error" in parseOvertureImport("[]")).toBe(true);
    expect(
      "error" in parseOvertureImport(JSON.stringify([{ ...row, id: "" }])),
    ).toBe(true);
    expect(
      "error" in
        parseOvertureImport(JSON.stringify([row, { ...row, latitude: 999 }])),
    ).toBe(true);
  });

  it("caps the rows per run", () => {
    const many = Array.from({ length: MAX_CANDIDATES_PER_RUN + 1 }, (_, i) => ({
      ...row,
      id: `id-${i}`,
    }));
    const result = parseOvertureImport(JSON.stringify(many));
    expect("error" in result && result.error).toMatch(/at most/);
  });
});

describe("shapeBraveResults", () => {
  it("keeps only https results with url and synthesizes titles", () => {
    const shaped = shapeBraveResults({
      web: {
        results: [
          { url: "https://instagram.com/a", title: "Studio A" },
          { url: "http://insecure.example", title: "Nope" },
          { url: "https://b.example", title: "" },
          { title: "no url" },
          null,
        ],
      },
    });
    expect(shaped).toHaveLength(2);
    expect(shaped[0]).toEqual({
      url: "https://instagram.com/a",
      title: "Studio A",
    });
    expect(shaped[1].title).toBe("https://b.example");
  });

  it("returns empty on junk payloads", () => {
    expect(shapeBraveResults(null)).toEqual([]);
    expect(shapeBraveResults({})).toEqual([]);
    expect(shapeBraveResults({ web: { results: "x" } })).toEqual([]);
  });
});

describe("instagramHandleFromSeedUrl", () => {
  it("extracts real handles and rejects feature path segments", () => {
    expect(
      instagramHandleFromSeedUrl("https://instagram.com/golden.sun.tattoo"),
    ).toBe("golden.sun.tattoo");
    expect(
      instagramHandleFromSeedUrl("https://www.instagram.com/Some_Studio/"),
    ).toBe("some_studio");
    expect(instagramHandleFromSeedUrl("https://instagram.com/p/abc123")).toBe(
      null,
    );
    expect(instagramHandleFromSeedUrl("https://instagram.com/reel/xyz")).toBe(
      null,
    );
    expect(
      instagramHandleFromSeedUrl("https://instagram.com/explore/tags/tattoo"),
    ).toBe(null);
    expect(instagramHandleFromSeedUrl("https://example.com/x")).toBe(null);
    expect(instagramHandleFromSeedUrl(null)).toBe(null);
  });
});

describe("url hygiene", () => {
  it("dedupes brave results by url", () => {
    const shaped = shapeBraveResults({
      web: {
        results: [
          { url: "https://a.example", title: "First" },
          { url: "https://a.example", title: "Second" },
        ],
      },
    });
    expect(shaped).toHaveLength(1);
    expect(shaped[0].title).toBe("First");
  });

  it("overture parse drops non-https website and social urls", () => {
    const result = parseOvertureImport(
      JSON.stringify([
        {
          id: "x",
          name: "Studio",
          latitude: 1,
          longitude: 1,
          websiteUrl: "http://insecure.example",
          socialUrl: "javascript:alert(1)",
        },
      ]),
    );
    expect("candidates" in result).toBe(true);
    if ("candidates" in result) {
      expect(result.candidates[0].websiteUrl).toBeNull();
      expect(result.candidates[0].socialUrl).toBeNull();
    }
  });

  it("isHttpsSeedUrl accepts only https", () => {
    expect(isHttpsSeedUrl("https://x.example")).toBe(true);
    expect(isHttpsSeedUrl("http://x.example")).toBe(false);
    expect(isHttpsSeedUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsSeedUrl("not a url")).toBe(false);
  });
});

describe("usage keys", () => {
  it("derives UTC day and month keys", () => {
    const d = new Date("2026-07-18T23:59:59Z");
    expect(usageDayKey(d)).toBe("2026-07-18");
    expect(usageMonthKey(d)).toBe("2026-07");
  });
});
