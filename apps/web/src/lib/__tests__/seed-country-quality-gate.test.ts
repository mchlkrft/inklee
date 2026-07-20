import { describe, expect, it } from "vitest";
import {
  MIN_QUALITY_FIXTURES_PER_KIND,
  SEED_COUNTRY_CODES,
  getSeedCountry,
} from "@inklee/shared/seed-countries";
import { evaluateSeedCandidate } from "@inklee/shared/seed-filtering";

// THE COUNTRY QUALITY GATE (founder rule 2026-07-20): every registered
// country must prove, in its own language(s), that beauty salons and
// permanent-makeup businesses are filtered out and real studios accepted.
// This test iterates the WHOLE registry, so adding a country without a
// passing language fixture battery fails CI - onboarding without the
// quality check is structurally impossible.

describe("per-country quality gate", () => {
  for (const code of SEED_COUNTRY_CODES) {
    const country = getSeedCountry(code)!;

    describe(`${country.name} (${code}, ${country.languages.join("/")})`, () => {
      it("declares its languages and enough fixtures of each kind", () => {
        expect(country.languages.length).toBeGreaterThan(0);
        const accepts = country.qualityFixtures.filter(
          (f) => f.expect === "accept",
        );
        const beautyRejects = country.qualityFixtures.filter(
          (f) => f.expect === "reject_beauty",
        );
        expect(accepts.length).toBeGreaterThanOrEqual(
          MIN_QUALITY_FIXTURES_PER_KIND,
        );
        expect(beautyRejects.length).toBeGreaterThanOrEqual(
          MIN_QUALITY_FIXTURES_PER_KIND,
        );
      });

      for (const fixture of country.qualityFixtures) {
        it(`${fixture.expect}: ${fixture.name}`, () => {
          const result = evaluateSeedCandidate(
            {
              name: fixture.name,
              extraText: fixture.extraText
                ? [{ field: "bio", text: fixture.extraText }]
                : undefined,
            },
            {
              extraPositive: country.extraPositive,
              extraNegative: country.extraNegative,
            },
          );
          if (fixture.expect === "accept") {
            expect(result.decision).toBe("accept_automated");
          } else if (fixture.expect === "reject_beauty") {
            expect(result.decision).toBe("reject_beauty");
          } else {
            expect(result.decision).not.toBe("accept_automated");
          }
        });
      }
    });
  }
});
