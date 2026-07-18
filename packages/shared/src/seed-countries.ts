// Country configurations for automated seeding. Country-specific vocabulary,
// normalization, and location checks live HERE, never scattered through the
// generic pipeline. ISO 3166-1 alpha-2 codes.

import {
  compileSeedVocabulary,
  type SeedVocabularyPhrase,
} from "./seed-filtering";

export type SeedCountryConfig = {
  code: string;
  name: string;
  /** Extra positive phrases beyond the base vocabulary. */
  extraPositive: SeedVocabularyPhrase[];
  /** Extra negative phrases beyond the base vocabulary. */
  extraNegative: SeedVocabularyPhrase[];
  /** Postal code shape, for location plausibility checks. */
  postalCodePattern: RegExp | null;
};

const DE: SeedCountryConfig = {
  code: "DE",
  name: "Germany",
  // German-language evidence is NEVER required (many German studios operate
  // in English); these only widen recognition. The base vocabulary already
  // carries the core German terms; these add long-tail variants.
  extraPositive: compileSeedVocabulary(
    [
      ["tattoo termin", "strong"],
      ["tattoo termine", "strong"],
      ["stechen lassen", "weak"],
      ["feinlinien", "weak"],
    ],
    "german_tattoo",
  ),
  extraNegative: compileSeedVocabulary(
    [
      ["dauerhafte haarentfernung", "weak"],
      ["fusspflege", "weak"],
      ["podologie", "weak"],
    ],
    "german_beauty",
  ),
  postalCodePattern: /^\d{5}$/,
};

const TH: SeedCountryConfig = {
  code: "TH",
  name: "Thailand",
  extraPositive: compileSeedVocabulary(
    [
      ["สัก", "strong"],
      ["สักลาย", "strong"],
      ["รับสักลาย", "strong"],
      ["ลายสัก", "strong"],
      ["bamboo tattoo", "strong"],
    ],
    "thai_tattoo",
  ),
  extraNegative: compileSeedVocabulary(
    [
      ["คิ้ว", "strong"],
      ["สักคิ้ว", "strong"],
      ["อายบราว", "strong"],
      ["ต่อขนตา", "strong"],
    ],
    "thai_beauty",
  ),
  postalCodePattern: /^\d{5}$/,
};

const REGISTRY: Record<string, SeedCountryConfig> = { DE, TH };

export function getSeedCountry(code: string): SeedCountryConfig | null {
  return REGISTRY[code.toUpperCase()] ?? null;
}

export const SEED_COUNTRY_CODES = Object.keys(REGISTRY);
