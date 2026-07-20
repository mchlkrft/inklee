// Country configurations for automated seeding. Country-specific vocabulary,
// normalization, and location checks live HERE, never scattered through the
// generic pipeline. ISO 3166-1 alpha-2 codes.
//
// ONBOARDING RULE (founder decision 2026-07-20): every country ships with a
// language-specific QUALITY GATE - its qualityFixtures must prove that
// beauty salons and permanent-makeup businesses written in the country's
// own language(s) are rejected, and real studios accepted. A shared test
// runs every registered country's fixtures against its vocabulary; a
// country without passing fixtures cannot be registered. The rollout order
// lives in docs/product/inklee-2-country-rollout.md.

import {
  compileSeedVocabulary,
  type SeedVocabularyPhrase,
} from "./seed-filtering";

export type SeedQualityFixture = {
  /** The business name, as the country's data would spell it. */
  name: string;
  /** Optional bio/description evidence line. */
  extraText?: string;
  /**
   * accept = must be auto-accepted; reject_beauty = must be rejected as a
   * beauty/PMU business; not_accept = anything except automatic import
   * (mixed businesses may legitimately land in review).
   */
  expect: "accept" | "reject_beauty" | "not_accept";
};

export type SeedCountryConfig = {
  code: string;
  name: string;
  /** Languages the vocabulary and fixtures cover. */
  languages: string[];
  /** Extra positive phrases beyond the base vocabulary. */
  extraPositive: SeedVocabularyPhrase[];
  /** Extra negative phrases beyond the base vocabulary. */
  extraNegative: SeedVocabularyPhrase[];
  /** Postal code shape, for location plausibility checks. */
  postalCodePattern: RegExp | null;
  /** The language quality gate (enforced by the shared registry test). */
  qualityFixtures: SeedQualityFixture[];
};

/** Every country needs at least this many accepts and beauty rejections. */
export const MIN_QUALITY_FIXTURES_PER_KIND = 3;

const DE: SeedCountryConfig = {
  code: "DE",
  name: "Germany",
  languages: ["de", "en"],
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
  qualityFixtures: [
    { name: "Wildstil Tätowierstudio Berlin", expect: "accept" },
    { name: "Anna Meier, Tätowiererin", expect: "accept" },
    { name: "Nordlicht Tattoo Hamburg", expect: "accept" },
    { name: "PMU Academy München", expect: "reject_beauty" },
    { name: "Kosmetikstudio Elbblick", expect: "reject_beauty" },
    {
      name: "Browlounge",
      extraText: "Microblading und Powder Brows nach Termin.",
      expect: "reject_beauty",
    },
    { name: "Beauty Lounge Mitte", expect: "reject_beauty" },
    { name: "Cosmetic Tattoo Studio Köln", expect: "not_accept" },
  ],
};

const AT: SeedCountryConfig = {
  code: "AT",
  name: "Austria",
  languages: ["de", "en"],
  // Austrian German rides the base German vocabulary; only long-tail
  // variants are added here.
  extraPositive: compileSeedVocabulary(
    [
      ["tattoo termin", "strong"],
      ["tattoo termine", "strong"],
      ["stechen lassen", "weak"],
    ],
    "austrian_tattoo",
  ),
  extraNegative: compileSeedVocabulary(
    [
      ["dauerhafte haarentfernung", "weak"],
      ["fusspflege", "weak"],
      ["podologie", "weak"],
    ],
    "austrian_beauty",
  ),
  postalCodePattern: /^\d{4}$/,
  qualityFixtures: [
    { name: "Tätowierstudio Wien Neubau", expect: "accept" },
    { name: "Alpen Tattoo Innsbruck", expect: "accept" },
    {
      name: "Schwarze Rose",
      extraText: "Tattoostudio im Herzen von Graz, Termine online.",
      expect: "accept",
    },
    { name: "Permanent Make-up Studio Wien", expect: "reject_beauty" },
    { name: "Kosmetikstudio Salzburg", expect: "reject_beauty" },
    {
      name: "Brow Bar Linz",
      extraText: "Microblading, Wimpernlifting und Puder Augenbrauen.",
      expect: "reject_beauty",
    },
    { name: "Beauty Lounge Klagenfurt", expect: "reject_beauty" },
    { name: "Kosmetik Tattoo Atelier", expect: "not_accept" },
  ],
};

const CH: SeedCountryConfig = {
  code: "CH",
  name: "Switzerland",
  languages: ["de", "fr", "it", "en"],
  // Switzerland needs THREE language passes: German rides the base, French
  // and Italian get their own positive and negative vocabulary.
  extraPositive: compileSeedVocabulary(
    [
      // French
      ["salon de tatouage", "strong"],
      ["studio de tatouage", "strong"],
      ["tatoueur", "strong"],
      ["tatoueuse", "strong"],
      ["tatouage", "strong"],
      ["tatouages", "strong"],
      // Italian
      ["tatuatore", "strong"],
      ["tatuatrice", "strong"],
      ["studio di tatuaggi", "strong"],
      ["tatuaggio", "strong"],
      ["tatuaggi", "strong"],
    ],
    "swiss_tattoo",
  ),
  extraNegative: compileSeedVocabulary(
    [
      // French beauty/PMU
      ["maquillage permanent", "strong"],
      ["maquillage semi permanent", "strong"],
      ["pigmentation des sourcils", "strong"],
      ["sourcils poudres", "strong"],
      ["institut de beaute", "strong"],
      ["salon de beaute", "strong"],
      ["salon d esthetique", "strong"],
      ["estheticienne", "strong"],
      ["onglerie", "strong"],
      ["extension de cils", "weak"],
      ["rehaussement de cils", "weak"],
      ["epilation", "weak"],
      // Italian beauty/PMU
      ["trucco permanente", "strong"],
      ["trucco semipermanente", "strong"],
      ["dermopigmentazione", "strong"],
      ["centro estetico", "strong"],
      ["salone di bellezza", "strong"],
      ["estetista", "strong"],
      ["ricostruzione unghie", "strong"],
      ["extension ciglia", "weak"],
      ["laminazione ciglia", "weak"],
    ],
    "swiss_beauty",
  ),
  postalCodePattern: /^\d{4}$/,
  qualityFixtures: [
    { name: "Tätowierstudio Zürich Kreis 4", expect: "accept" },
    { name: "Salon de tatouage Genève", expect: "accept" },
    { name: "Studio di tatuaggi Lugano", expect: "accept" },
    {
      name: "Ligne Noire",
      extraText: "Tatoueur et tatoueuse, projets sur mesure à Lausanne.",
      expect: "accept",
    },
    { name: "Institut de beauté Lausanne", expect: "reject_beauty" },
    {
      name: "Sourcils et Cie",
      extraText: "Maquillage permanent et pigmentation des sourcils.",
      expect: "reject_beauty",
    },
    { name: "Centro estetico Bellinzona", expect: "reject_beauty" },
    {
      name: "Bella Vita",
      extraText: "Trucco permanente, ricostruzione unghie ed estetista.",
      expect: "reject_beauty",
    },
    { name: "Kosmetikstudio Basel", expect: "reject_beauty" },
    { name: "Dermopigmentation Genève", expect: "not_accept" },
  ],
};

const TH: SeedCountryConfig = {
  code: "TH",
  name: "Thailand",
  languages: ["th", "en"],
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
  qualityFixtures: [
    { name: "Golden Sun Tattoo Temple", expect: "accept" },
    { name: "Sak Yant Chiang Mai", expect: "accept" },
    { name: "ร้านสักลายเชียงใหม่", expect: "accept" },
    { name: "Bangkok Beauty Salon", expect: "reject_beauty" },
    {
      name: "Brows Bangkok",
      extraText: "Microblading and powder brows studio.",
      expect: "reject_beauty",
    },
    { name: "ร้านสักคิ้ว เชียงใหม่", expect: "not_accept" },
    {
      name: "Lash and Brow House",
      extraText: "Eyelash extensions, microblading and lash lift.",
      expect: "reject_beauty",
    },
  ],
};

const REGISTRY: Record<string, SeedCountryConfig> = { DE, AT, CH, TH };

export function getSeedCountry(code: string): SeedCountryConfig | null {
  return REGISTRY[code.toUpperCase()] ?? null;
}

export const SEED_COUNTRY_CODES = Object.keys(REGISTRY);
