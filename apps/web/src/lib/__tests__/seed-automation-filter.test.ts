import { describe, expect, it } from "vitest";
import {
  applySeedDuplicateDecision,
  evaluateSeedCandidate,
  normalizeSeedText,
  statusForSeedDecision,
  MIN_AUTOMATED_CONFIDENCE,
  type SeedEvaluationInput,
} from "@inklee/shared/seed-filtering";
import { getSeedCountry } from "@inklee/shared/seed-countries";

// The automated seed lane's filter fixtures (brief-mandated battery).
// Layer 1 = conventional tattoo relevance; layer 2 = beauty/PMU exclusion.
// Deterministic ruleset: these tests pin decisions, not just "roughly right".

const de = getSeedCountry("DE")!;
const th = getSeedCountry("TH")!;

function evalDE(input: SeedEvaluationInput) {
  return evaluateSeedCandidate(input, {
    extraPositive: de.extraPositive,
    extraNegative: de.extraNegative,
  });
}

describe("layer 1: conventional tattoo relevance", () => {
  it("accepts a Berlin studio with clear German tattoo strings", () => {
    const r = evalDE({
      name: "Wildstil Tätowierstudio Berlin",
      extraText: [{ field: "bio", text: "Tätowierungen nach Termin." }],
    });
    expect(r.decision).toBe("accept_automated");
    expect(r.confidence).toBeGreaterThanOrEqual(MIN_AUTOMATED_CONFIDENCE);
    expect(r.firedRules).toContain("R-ACCEPT");
  });

  it("accepts a Hamburg solo artist styled as Tätowierer", () => {
    const r = evalDE({ name: "Jonas Weber, Tätowierer Hamburg" });
    expect(r.decision).toBe("accept_automated");
  });

  it("accepts a studio with a mixed German-English bio", () => {
    const r = evalDE({
      name: "Nordlicht Ink",
      extraText: [
        {
          field: "bio",
          text: "Custom tattoo studio in St. Pauli. Termine über das Formular, walk ins welcome.",
        },
      ],
    });
    expect(r.decision).toBe("accept_automated");
  });

  it("accepts on structured provider category alone", () => {
    const r = evalDE({
      name: "Schwarzarbeit",
      category: "tattoo_and_piercing",
    });
    expect(r.decision).toBe("accept_automated");
    expect(r.firedRules).toContain("R-CAT-TATTOO");
  });

  it("rejects a name with no evidence at all", () => {
    const r = evalDE({ name: "Studio 54 Berlin" });
    expect(r.decision).toBe("reject_insufficient_evidence");
    expect(r.firedRules).toContain("R-NO-EVIDENCE");
  });

  it("rejects weak-only evidence (search-result presence is not corroboration)", () => {
    const r = evalDE({
      name: "Black Lodge",
      extraText: [{ field: "snippet", text: "flash and walk ins" }],
    });
    expect(r.decision).toBe("reject_insufficient_evidence");
    expect(r.firedRules).toContain("R-WEAK-ONLY");
  });

  it("rejects an off-topic category without tattoo evidence", () => {
    const r = evalDE({ name: "Goldene Sonne", category: "restaurant" });
    expect(r.decision).toBe("reject_not_tattoo");
    expect(r.firedRules).toContain("R-OFF-TOPIC");
  });
});

describe("layer 2: beauty and PMU exclusion", () => {
  it("rejects a microblading salon", () => {
    const r = evalDE({
      name: "Browart Studio",
      extraText: [{ field: "bio", text: "Microblading und Powder Brows." }],
    });
    expect(r.decision).toBe("reject_beauty");
  });

  it("rejects a PMU academy by name", () => {
    const r = evalDE({ name: "PMU Academy Berlin" });
    expect(r.decision).toBe("reject_beauty");
    expect(r.firedRules.some((rule) => rule.startsWith("R-NAME-BEAUTY"))).toBe(
      true,
    );
    expect(r.confidence).toBeGreaterThanOrEqual(85);
  });

  it("rejects a brow studio", () => {
    const r = evalDE({ name: "Perfect Brow Studio" });
    expect(r.decision).toBe("reject_beauty");
  });

  it("rejects a lip blush artist", () => {
    const r = evalDE({
      name: "Lippenzauber",
      extraText: [
        { field: "bio", text: "Lip Blush und Permanent Make-up für Sie." },
      ],
    });
    expect(r.decision).toBe("reject_beauty");
  });

  it("rejects an SMP clinic", () => {
    const r = evalDE({
      name: "Haarpigmentierung Nord",
      extraText: [{ field: "bio", text: "Scalp micropigmentation clinic." }],
    });
    expect(r.decision).toBe("reject_beauty");
  });

  it("rejects a German cosmetic studio (kosmetikstudio vocabulary)", () => {
    const r = evalDE({ name: "Kosmetikstudio Elbblick" });
    expect(r.decision).toBe("reject_beauty");
  });

  it("never auto-imports a beauty business whose name contains tattoo", () => {
    const r = evalDE({ name: "Cosmetic Tattoo Lounge" });
    expect(r.decision).not.toBe("accept_automated");
    expect(["reject_beauty", "review_mixed_business"]).toContain(r.decision);
  });

  it("rejects a PMU name even when the provider category says tattoo", () => {
    // Overture routinely files PMU studios under the tattoo category; the
    // name identity wins over the machine-derived category.
    const r = evalDE({
      name: "Permanent Make-up by Petra",
      category: "tattoo_and_piercing",
    });
    expect(r.decision).toBe("reject_beauty");
    expect(r.firedRules).toContain("R-NAME-BEAUTY-OVER-CATEGORY");
    // Textual tattoo evidence still means genuinely mixed -> review.
    const mixed = evalDE({
      name: "Stay Gold Tattoo & Permanent Makeup",
      category: "tattoo_and_piercing",
    });
    expect(mixed.decision).toBe("review_mixed_business");
  });
});

describe("mixed and ambiguous businesses go to humans", () => {
  it("routes a tattoo studio with a PMU resident to mixed-business review", () => {
    const r = evalDE({
      name: "Anker Tattoo Studio",
      extraText: [
        {
          field: "bio",
          text: "Custom tattoo work. Our resident also offers permanent makeup.",
        },
      ],
    });
    expect(r.decision).toBe("review_mixed_business");
    expect(r.firedRules).toContain("R-MIXED");
  });

  it("does not reject a tattoo artist for scar-cover work (weak paramedical)", () => {
    const r = evalDE({
      name: "Deckwerk Tattoo",
      extraText: [
        { field: "bio", text: "Tattoo cover ups and scar camouflage." },
      ],
    });
    expect(r.decision).toBe("accept_automated");
  });

  it("does not reject a tattoo artist for mentioning freckle tattoos (weak)", () => {
    const r = evalDE({
      name: "Feine Linien Tattoo",
      extraText: [
        {
          field: "bio",
          text: "Fine line tattoos, also freckle tattoo on request.",
        },
      ],
    });
    expect(r.decision).toBe("accept_automated");
  });
});

describe("normalization (the ä/ae duplicate class)", () => {
  it("collapses umlaut and transliterated spellings to one form", () => {
    expect(normalizeSeedText("Tätowierer")).toBe(
      normalizeSeedText("Taetowierer"),
    );
    expect(normalizeSeedText("Café-Tattoo & Söhne")).toBe(
      normalizeSeedText("Cafe Tattoo Soehne"),
    );
  });

  it("fires the same rule on both spellings", () => {
    const a = evalDE({ name: "Tätowierer München" });
    const b = evalDE({ name: "Taetowierer Muenchen" });
    expect(a.decision).toBe(b.decision);
    expect(a.decision).toBe("accept_automated");
  });

  it("does not fire word-boundary phrases inside other words", () => {
    // "ink" must not fire inside "drink".
    const r = evalDE({ name: "Drink Point Berlin" });
    expect(r.positiveSignals).toHaveLength(0);
  });

  it("clamps confidence to 0..100 under extreme weak-negative stacking", () => {
    // One strong positive plus a wall of weak beauty services across three
    // fields: the unclamped accept formula would go negative (the stored
    // value carries a 0..100 CHECK constraint).
    const wall =
      "brow lamination brow tint brow shaping brow waxing brow threading henna brows lash lift lash extensions lash tint manicure pedicure facials waxing threading botox fillers injectables";
    const r = evalDE({
      name: `Tattoo ${wall}`,
      extraText: [
        { field: "website_url", text: wall.replace(/ /g, "-") },
        { field: "social_url", text: wall.replace(/ /g, "_") },
      ],
    });
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
    expect(r.decision).not.toBe("accept_automated");
  });
});

describe("duplicate decisions and claimed-profile protection", () => {
  it("marks a clear duplicate as duplicate", () => {
    expect(
      applySeedDuplicateDecision(
        "accept_automated",
        { confidence: "clear" },
        false,
      ),
    ).toBe("duplicate");
  });

  it("routes softer duplicate hits to review", () => {
    expect(
      applySeedDuplicateDecision(
        "accept_automated",
        { confidence: "likely" },
        false,
      ),
    ).toBe("possible_duplicate");
    expect(
      applySeedDuplicateDecision(
        "accept_automated",
        { confidence: "possible" },
        false,
      ),
    ).toBe("possible_duplicate");
  });

  it("treats any hit on a claimed profile as a hard duplicate", () => {
    expect(
      applySeedDuplicateDecision(
        "accept_automated",
        { confidence: "possible" },
        true,
      ),
    ).toBe("duplicate");
  });

  it("keeps rejections regardless of duplicate evidence", () => {
    expect(
      applySeedDuplicateDecision(
        "reject_beauty",
        { confidence: "clear" },
        false,
      ),
    ).toBe("reject_beauty");
  });

  it("is idempotent (interrupted-run resume re-applies safely)", () => {
    const once = applySeedDuplicateDecision(
      "accept_automated",
      { confidence: "clear" },
      false,
    );
    expect(
      applySeedDuplicateDecision(once, { confidence: "clear" }, false),
    ).toBe(once);
  });
});

describe("decision to queue-status mapping (manual workflow contract)", () => {
  it("only accept_automated may proceed toward conversion", () => {
    expect(statusForSeedDecision("accept_automated")).toBe(
      "approved_for_enrichment",
    );
  });
  it("review decisions surface in the existing manual queue as new", () => {
    expect(statusForSeedDecision("review_mixed_business")).toBe("new");
    expect(statusForSeedDecision("review_ambiguous")).toBe("new");
    expect(statusForSeedDecision("possible_duplicate")).toBe("new");
  });
  it("rejections and duplicates use the existing manual statuses", () => {
    expect(statusForSeedDecision("reject_beauty")).toBe("rejected");
    expect(statusForSeedDecision("reject_not_tattoo")).toBe("rejected");
    expect(statusForSeedDecision("reject_insufficient_evidence")).toBe(
      "rejected",
    );
    expect(statusForSeedDecision("failed_validation")).toBe("rejected");
    expect(statusForSeedDecision("duplicate")).toBe("likely_duplicate");
  });
});

describe("Chiang Mai regression (the first manually seeded city)", () => {
  function evalTH(input: SeedEvaluationInput) {
    return evaluateSeedCandidate(input, {
      extraPositive: th.extraPositive,
      extraNegative: th.extraNegative,
    });
  }

  it("accepts an English-named Thai studio", () => {
    const r = evalTH({ name: "Golden Sun Tattoo Temple" });
    expect(r.decision).toBe("accept_automated");
  });

  it("accepts sak yant studios", () => {
    const r = evalTH({ name: "Sak Yant Chiang Mai by Ajarn Kob" });
    expect(r.decision).toBe("accept_automated");
  });

  it("matches Thai script without word boundaries", () => {
    const r = evalTH({ name: "ร้านสักลายเชียงใหม่" });
    expect(r.decision).toBe("accept_automated");
  });

  it("never auto-imports a Thai brow studio", () => {
    // สักคิ้ว (eyebrow tattoo) contains สัก (tattoo), so both sides fire;
    // the mixed rule keeps it away from automated import.
    const r = evalTH({ name: "ร้านสักคิ้ว เชียงใหม่" });
    expect(r.decision).not.toBe("accept_automated");
  });
});
