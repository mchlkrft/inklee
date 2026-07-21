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
  /** Optional provider category (tests the category-vs-name precedence). */
  category?: string;
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
      // Abbreviated PMU spelling found in the wild ("Perm.make-up" normalizes
      // to "perm make up") that the base "permanent make up" phrase misses.
      ["perm make up", "strong"],
      ["perm makeup", "strong"],
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
    { name: "Studio Perm.make-up & Tattoos", expect: "not_accept" },
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
    {
      // Observed at scale in the 2026-07-20 rollout: Overture files pure
      // PMU studios under the tattoo category; the name must win.
      name: "I LINE Permanent Make Up Studio",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
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

const GB: SeedCountryConfig = {
  code: "GB",
  name: "United Kingdom",
  languages: ["en"],
  // English is the base vocabulary; the UK pass adds British spellings and
  // market-specific salon vocabulary.
  extraPositive: compileSeedVocabulary(
    [
      ["tattoo parlour", "strong"],
      ["tattoo parlor", "strong"],
      ["tattoo lounge", "strong"],
      ["tattooers", "strong"],
    ],
    "uk_tattoo",
  ),
  extraNegative: compileSeedVocabulary(
    [
      ["beauty parlour", "strong"],
      ["beauty parlor", "strong"],
      ["nail bar", "strong"],
      ["brow boutique", "strong"],
      ["aesthetics studio", "strong"],
      ["semi permanent brows", "strong"],
      ["spray tan", "weak"],
      ["dermal filler clinic", "weak"],
    ],
    "uk_beauty",
  ),
  postalCodePattern: /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/,
  qualityFixtures: [
    { name: "Frith Street Tattoo", expect: "accept" },
    { name: "Black Garden Tattoo Parlour", expect: "accept" },
    {
      name: "Northside Ink",
      extraText: "Custom tattoo studio in Newcastle, walk ins welcome.",
      expect: "accept",
    },
    { name: "The Permanent Makeup Clinic London", expect: "reject_beauty" },
    { name: "Brow Bar Leeds", expect: "reject_beauty" },
    { name: "Glow Beauty Parlour", expect: "reject_beauty" },
    {
      name: "Define Aesthetics Studio",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    { name: "SMP Clinic Manchester", expect: "reject_beauty" },
    {
      name: "Ink and Brows Studio",
      extraText: "Tattoo studio and microblading in one place.",
      expect: "not_accept",
    },
    {
      // A real artist mislabeled beauty_salon by the provider must not be
      // rejected outright; the name evidence forces a human look.
      name: "Jesse Rodriguez Tattooing",
      category: "beauty_salon",
      expect: "not_accept",
    },
  ],
};

const US: SeedCountryConfig = {
  code: "US",
  name: "United States",
  languages: ["en", "es"],
  extraPositive: compileSeedVocabulary(
    [
      ["tattoo parlor", "strong"],
      ["tattoo company", "strong"],
      ["tattoo collective", "strong"],
      ["body art studio", "strong"],
      ["tattoo emporium", "strong"],
      // Spanish-language studios (large market in the southwest).
      ["estudio de tatuajes", "strong"],
      ["tatuajes", "strong"],
      ["tatuador", "strong"],
    ],
    "us_tattoo",
  ),
  extraNegative: compileSeedVocabulary(
    [
      // The American beauty market's own vocabulary.
      ["med spa", "strong"],
      ["medspa", "strong"],
      ["medical spa", "strong"],
      ["day spa", "strong"],
      ["wellness spa", "strong"],
      ["beauty bar", "strong"],
      ["blow dry bar", "strong"],
      ["waxing studio", "strong"],
      ["salon and spa", "strong"],
      ["nails and spa", "strong"],
      ["permanent cosmetics studio", "strong"],
      ["microblading studio", "strong"],
      ["body contouring", "weak"],
      ["teeth whitening", "weak"],
      ["botox bar", "weak"],
      // Spanish beauty vocabulary.
      ["salon de belleza", "strong"],
      ["maquillaje permanente", "strong"],
      ["micropigmentacion", "strong"],
      ["cejas y pestanas", "strong"],
    ],
    "us_beauty",
  ),
  postalCodePattern: /^\d{5}(-\d{4})?$/,
  qualityFixtures: [
    { name: "Ink Master Tattoo Studio Austin", expect: "accept" },
    { name: "Sailor's Grave Tattoo Parlor", expect: "accept" },
    {
      name: "Black Anchor",
      extraText: "Custom tattoo shop in Portland, walk ins welcome.",
      expect: "accept",
    },
    { name: "Estudio de Tatuajes San Antonio", expect: "accept" },
    { name: "Radiance Med Spa", expect: "reject_beauty" },
    { name: "Brow Bar Beverly Hills", expect: "reject_beauty" },
    {
      name: "Lumina Permanent Makeup",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    { name: "Glam Beauty Bar and Day Spa", expect: "reject_beauty" },
    { name: "Salon de Belleza Maria", expect: "reject_beauty" },
    {
      name: "Steel and Rose Tattoo and Permanent Makeup",
      expect: "not_accept",
    },
  ],
};

const ES: SeedCountryConfig = {
  code: "ES",
  name: "Spain",
  // Castilian leads; Catalan matters for Barcelona, one of the country's
  // biggest tattoo markets. English is common in studio names too.
  languages: ["es", "ca", "en"],
  extraPositive: compileSeedVocabulary(
    [
      ["estudio de tatuajes", "strong"],
      ["estudio de tatuaje", "strong"],
      ["tatuajes", "strong"],
      ["tatuaje", "strong"],
      ["tatuador", "strong"],
      ["tatuadora", "strong"],
      // Catalan
      ["tatuatge", "strong"],
      ["tatuatges", "strong"],
      ["estudi de tatuatges", "strong"],
    ],
    "spanish_tattoo",
  ),
  extraNegative: compileSeedVocabulary(
    [
      ["salon de belleza", "strong"],
      ["centro de estetica", "strong"],
      ["centro estetico", "strong"],
      ["clinica estetica", "strong"],
      // Bare identity words: the ES rollout dry run (2026-07-20) surfaced
      // pure beauty salons filed under the tattoo category ("Estética Carmen",
      // "Centro de Belleza Duo's", "Casanova Style Peluqueros") that the
      // multi-word phrases above never caught. Whole-word matching means these
      // fire only as standalone words, and a real tattoo positive alongside
      // routes to review, not reject.
      ["estetica", "strong"],
      ["estetico", "strong"],
      ["belleza", "strong"],
      ["micropigmentacion", "strong"],
      ["dermopigmentacion", "strong"],
      ["maquillaje permanente", "strong"],
      ["maquillaje semipermanente", "strong"],
      ["cejas y pestanas", "strong"],
      ["salon de unas", "strong"],
      ["uñas", "strong"],
      ["manicura", "strong"],
      ["peluqueria", "strong"],
      ["peluquero", "strong"],
      ["peluqueros", "strong"],
      ["esteticista", "strong"],
      ["depilacion laser", "weak"],
      ["lifting de pestanas", "weak"],
      ["extensiones de pestanas", "weak"],
      ["solarium", "weak"],
      ["bronceado", "weak"],
      // Catalan (estètica normalizes to the estetica entry above)
      ["centre d estetica", "strong"],
      ["bellesa", "strong"],
      ["micropigmentacio", "strong"],
      ["ungles", "strong"],
      ["perruqueria", "strong"],
      ["perruquers", "strong"],
    ],
    "spanish_beauty",
  ),
  postalCodePattern: /^\d{5}$/,
  qualityFixtures: [
    { name: "Estudio de Tatuajes Madrid Centro", expect: "accept" },
    { name: "La Aguja Dorada Tatuajes", expect: "accept" },
    { name: "Estudi de Tatuatges Gràcia", expect: "accept" },
    {
      name: "Nomada Ink",
      extraText: "Tatuador especializado en blackwork en Valencia.",
      expect: "accept",
    },
    { name: "Salón de Belleza Marisol", expect: "reject_beauty" },
    { name: "Centro de Estética Bella Piel", expect: "reject_beauty" },
    {
      name: "Micropigmentación Sevilla",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    { name: "Cejas y Pestañas Studio", expect: "reject_beauty" },
    { name: "Perruqueria i Estètica Núria", expect: "reject_beauty" },
    // Real dry-run false-accepts (2026-07-20): pure beauty filed under the
    // tattoo category. Bare "estética" / "peluqueros" / Catalan
    // "micropigmentació" must reject even when the machine category says tattoo.
    {
      name: "Estética Carmen",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    {
      name: "Casanova Style Peluqueros",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    {
      name: "Gemma Micropigmentació",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    {
      name: "Tattoo y Micropigmentación Alicante",
      expect: "not_accept",
    },
    // Mixed tattoo + beauty identity: a real tattoo positive alongside a
    // strong beauty word goes to review, never auto-import.
    {
      name: "Estética y Tatuaje B. Barbera",
      expect: "not_accept",
    },
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

const FR: SeedCountryConfig = {
  code: "FR",
  name: "France",
  // French dominates studio names nationwide; English loanwords ("tattoo")
  // are common. Regional languages (Occitan, Breton, Corsican, Basque) still
  // use the French tattoo/beauty vocabulary in practice.
  languages: ["fr", "en"],
  extraPositive: compileSeedVocabulary(
    [
      ["tatouage", "strong"],
      ["tatouages", "strong"],
      ["salon de tatouage", "strong"],
      ["studio de tatouage", "strong"],
      ["atelier de tatouage", "strong"],
      ["tatoueur", "strong"],
      ["tatoueuse", "strong"],
    ],
    "french_tattoo",
  ),
  // Applying the Spain lesson (ruleset 2026-07-20.3): the beauty identity
  // words go in BARE, not only as multi-word phrases, so a salon filed under
  // the tattoo category is caught. "esthétique"/"beauté" normalize accents
  // away automatically.
  extraNegative: compileSeedVocabulary(
    [
      ["institut de beaute", "strong"],
      ["salon de beaute", "strong"],
      ["beaute", "strong"],
      ["esthetique", "strong"],
      ["estheticienne", "strong"],
      ["soins esthetiques", "strong"],
      ["maquillage permanent", "strong"],
      ["maquillage semi permanent", "strong"],
      ["dermopigmentation", "strong"],
      ["dermographe", "strong"],
      ["microblading", "strong"],
      ["micropigmentation", "strong"],
      ["onglerie", "strong"],
      ["ongles", "strong"],
      ["manucure", "strong"],
      ["coiffure", "strong"],
      ["coiffeur", "strong"],
      ["extension de cils", "strong"],
      ["rehaussement de cils", "strong"],
      ["epilation", "weak"],
      ["epilation laser", "weak"],
      ["solarium", "weak"],
      ["bronzage", "weak"],
      ["sourcils", "weak"],
    ],
    "french_beauty",
  ),
  postalCodePattern: /^\d{5}$/,
  qualityFixtures: [
    { name: "Salon de Tatouage Paris 11", expect: "accept" },
    { name: "L'Encre Noire Tatouage", expect: "accept" },
    { name: "Atelier Tatoueur Lyon", expect: "accept" },
    {
      name: "Sacré Coeur Tattoo",
      extraText: "Tatoueur spécialisé blackwork à Marseille.",
      expect: "accept",
    },
    { name: "Institut de Beauté Sophie", expect: "reject_beauty" },
    {
      name: "Esthétique Carmen",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    { name: "Onglerie Chic Nails", expect: "reject_beauty" },
    {
      name: "Maquillage Permanent Lyon",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    { name: "Coiffure & Esthétique Marie", expect: "reject_beauty" },
    {
      name: "Tatouage & Maquillage Permanent Nice",
      expect: "not_accept",
    },
  ],
};

const JP: SeedCountryConfig = {
  code: "JP",
  name: "Japan",
  languages: ["ja", "en"],
  // Japanese has no word spacing, so these match as substrings (the filter's
  // NO_WORD_BOUNDARY path). タトゥー is the katakana loanword; 刺青/入れ墨 the
  // traditional terms; 彫師 the artist; 和彫り the traditional Japanese style.
  extraPositive: compileSeedVocabulary(
    [
      ["タトゥー", "strong"],
      ["タトゥースタジオ", "strong"],
      ["タトゥーアーティスト", "strong"],
      ["刺青", "strong"],
      ["入れ墨", "strong"],
      ["入墨", "strong"],
      ["彫師", "strong"],
      ["和彫り", "strong"],
    ],
    "japanese_tattoo",
  ),
  // アートメイク (art make) is the Japanese term for permanent makeup / cosmetic
  // tattooing and is the single most important exclusion; 美容 is beauty,
  // ネイル nails, まつげ eyelashes, エステ esthetic salon, 理容 barber. 眉毛/アイブロウ
  // catch eyebrow-PMU businesses that brand themselves with タトゥー.
  extraNegative: compileSeedVocabulary(
    [
      ["アートメイク", "strong"],
      ["美容", "strong"],
      ["美容室", "strong"],
      ["美容院", "strong"],
      ["美容整形", "strong"],
      ["ネイル", "strong"],
      ["ネイルサロン", "strong"],
      ["エステ", "strong"],
      ["エステティック", "strong"],
      ["まつげエクステ", "strong"],
      ["まつエク", "strong"],
      ["まつげ", "strong"],
      ["脱毛", "strong"],
      ["理容", "strong"],
      ["眉毛", "strong"],
      ["アイブロウ", "strong"],
      ["日焼け", "weak"],
    ],
    "japanese_beauty",
  ),
  postalCodePattern: /^\d{3}-?\d{4}$/,
  qualityFixtures: [
    { name: "東京タトゥースタジオ", expect: "accept" },
    { name: "刺青 彫政", expect: "accept" },
    { name: "Yokohama Ink Tattoo", expect: "accept" },
    {
      name: "和彫り 龍",
      extraText: "彫師による本格的な和彫り。",
      expect: "accept",
    },
    { name: "美容室 ハナ", expect: "reject_beauty" },
    {
      name: "アートメイク銀座",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    { name: "ネイルサロン キラキラ", expect: "reject_beauty" },
    { name: "まつげエクステ専門店 ルミエール", expect: "reject_beauty" },
    {
      name: "眉毛アートメイク＆タトゥー 表参道",
      expect: "not_accept",
    },
  ],
};

const NL: SeedCountryConfig = {
  code: "NL",
  name: "Netherlands",
  languages: ["nl", "en"],
  extraPositive: compileSeedVocabulary(
    [
      ["tatoeage", "strong"],
      ["tatoeages", "strong"],
      ["tattooshop", "strong"],
      ["tattoo studio", "strong"],
      ["tatoeeerder", "strong"],
    ],
    "dutch_tattoo",
  ),
  // Bare identity words included from the start (Spain lesson). "permanente
  // make-up" normalizes to "permanente make up"; schoonheid = beauty, nagels
  // = nails, kapper/kapsalon = hairdresser, wenkbrauwen = eyebrows (PMU).
  extraNegative: compileSeedVocabulary(
    [
      ["schoonheidssalon", "strong"],
      ["schoonheidsspecialist", "strong"],
      ["schoonheid", "strong"],
      ["beautysalon", "strong"],
      ["nagelstudio", "strong"],
      ["nagels", "strong"],
      ["manicure", "strong"],
      ["pedicure", "strong"],
      ["kapper", "strong"],
      ["kapsalon", "strong"],
      ["permanente make up", "strong"],
      ["permanente makeup", "strong"],
      ["microblading", "strong"],
      ["micropigmentatie", "strong"],
      ["wenkbrauwen", "strong"],
      ["wimperextensions", "strong"],
      ["wimpers", "strong"],
      ["ontharing", "weak"],
      ["huidverzorging", "weak"],
      ["zonnebank", "weak"],
    ],
    "dutch_beauty",
  ),
  postalCodePattern: /^\d{4}\s?[A-Za-z]{2}$/,
  qualityFixtures: [
    { name: "Tattoo Shop Amsterdam", expect: "accept" },
    { name: "Inktvis Tatoeage Rotterdam", expect: "accept" },
    { name: "Black Rose Tattoo Studio", expect: "accept" },
    {
      name: "De Naald",
      extraText: "Tatoeage studio in Utrecht, gespecialiseerd in fine line.",
      expect: "accept",
    },
    { name: "Schoonheidssalon Bella", expect: "reject_beauty" },
    {
      name: "Permanente Make-up Studio Den Haag",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    { name: "Nagelstudio Chique", expect: "reject_beauty" },
    { name: "Kapsalon Knip & Zo", expect: "reject_beauty" },
    {
      name: "Tattoo & Permanente Make-up Eindhoven",
      expect: "not_accept",
    },
  ],
};

const KR: SeedCountryConfig = {
  code: "KR",
  name: "South Korea",
  languages: ["ko", "en"],
  // Hangul has no word spacing, so these substring-match (the CJK path).
  // 타투 is the modern loanword; 문신 the traditional term; 타투이스트 the artist.
  extraPositive: compileSeedVocabulary(
    [
      ["타투", "strong"],
      ["타투이스트", "strong"],
      ["타투샵", "strong"],
      ["문신", "strong"],
      ["문신사", "strong"],
    ],
    "korean_tattoo",
  ),
  // 반영구화장 (semi-permanent makeup) is the Korean PMU term; 반영구 alone
  // often means it too. 눈썹문신 (eyebrow "tattoo") is eyebrow PMU and, because
  // it contains 문신, the subsumption rule strips that false positive so a
  // pure PMU shop rejects while a 타투-branded one goes to review. 미용 beauty,
  // 네일 nails, 속눈썹 eyelashes, 왁싱 waxing, 에스테틱 esthetic, 피부관리 skincare.
  extraNegative: compileSeedVocabulary(
    [
      ["반영구화장", "strong"],
      ["반영구", "strong"],
      ["눈썹문신", "strong"],
      ["눈썹", "strong"],
      ["아이라인", "strong"],
      ["미용실", "strong"],
      ["미용", "strong"],
      ["네일", "strong"],
      ["네일샵", "strong"],
      ["속눈썹", "strong"],
      ["왁싱", "strong"],
      ["에스테틱", "strong"],
      ["피부관리", "strong"],
      ["태닝", "weak"],
    ],
    "korean_beauty",
  ),
  postalCodePattern: /^\d{5}$/,
  qualityFixtures: [
    { name: "서울 타투 스튜디오", expect: "accept" },
    { name: "문신 장인 홍대", expect: "accept" },
    { name: "Busan Ink Tattoo", expect: "accept" },
    {
      name: "블랙로즈 타투",
      extraText: "홍대의 타투이스트, 블랙워크 전문.",
      expect: "accept",
    },
    { name: "미용실 코코", expect: "reject_beauty" },
    {
      name: "반영구화장 전문 강남",
      category: "tattoo_and_piercing",
      expect: "reject_beauty",
    },
    { name: "네일샵 뷰티", expect: "reject_beauty" },
    { name: "속눈썹 연장 전문", expect: "reject_beauty" },
    { name: "눈썹문신 타투 스튜디오", expect: "not_accept" },
  ],
};

const REGISTRY: Record<string, SeedCountryConfig> = {
  DE,
  AT,
  CH,
  GB,
  US,
  ES,
  TH,
  FR,
  JP,
  NL,
  KR,
};

export function getSeedCountry(code: string): SeedCountryConfig | null {
  return REGISTRY[code.toUpperCase()] ?? null;
}

export const SEED_COUNTRY_CODES = Object.keys(REGISTRY);
