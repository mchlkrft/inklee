// Seed relevance filtering (Inklee 2.0 automated seeding). Two explicit
// layers before any automated import: (1) conventional tattoo relevance and
// (2) beauty/PMU/cosmetic-tattoo exclusion. Deterministic rules with IDs,
// field-level evidence, and a human-readable explanation; a score supports
// the decision but never replaces the rules. SoT:
// docs/product/inklee-2-seed-automation.md.

export const SEED_RULESET_VERSION = "2026-07-21.4";
export const SEED_PIPELINE_VERSION = "1.0.0";
export const SEED_SCHEMA_VERSION = "3"; // v2 description + contact fields (address/postal/phone/hours) + extra envelope

/** Minimum confidence for automatic import; below it, accept downgrades to review. */
export const MIN_AUTOMATED_CONFIDENCE = 70;

// ---------------------------------------------------------------------------
// Decisions. Only accept_automated imports automatically; review_* stay in
// the existing admin queue for the manual preview-and-convert workflow.

export const SEED_DECISIONS = [
  "accept_automated",
  "reject_beauty",
  "reject_not_tattoo",
  "reject_insufficient_evidence",
  "review_mixed_business",
  "review_ambiguous",
  "possible_duplicate",
  "duplicate",
  "failed_validation",
] as const;
export type SeedDecision = (typeof SEED_DECISIONS)[number];

export const SEED_DECISION_LABELS: Record<SeedDecision, string> = {
  accept_automated: "Accepted",
  reject_beauty: "Rejected: beauty business",
  reject_not_tattoo: "Rejected: not tattoo",
  reject_insufficient_evidence: "Rejected: not enough evidence",
  review_mixed_business: "Review: mixed business",
  review_ambiguous: "Review: ambiguous",
  possible_duplicate: "Possible duplicate",
  duplicate: "Duplicate",
  failed_validation: "Failed validation",
};

// ---------------------------------------------------------------------------
// Text normalization: casing, punctuation, hyphens, whitespace, accents,
// umlauts (both directions collapse to ae/oe/ue/ss), so "Tätowierer" and
// "Taetowierer" match the same phrase.

export function normalizeSeedText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_./\\,;:!?()'"`’&+|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Scripts written without spaces between words: Thai, Japanese (hiragana,
// katakana incl. halfwidth, kanji), Chinese, Korean. Phrases in these match
// as substrings because word boundaries do not exist to anchor on.
//
// normalizeSeedText runs NFD, which DECOMPOSES every precomposed Hangul
// syllable (가-힣) into conjoining jamo (U+1100-U+11FF), so the detector must
// cover the jamo ranges too or post-NFD Korean falls through to word-boundary
// matching and never fires on space-less names (반영구화장학원, 눈썹문신잘하는곳).
const NO_WORD_BOUNDARY =
  /[฀-๿぀-ヿ㐀-䶿一-鿿가-힯ｦ-ﾟᄀ-ᇿ㄰-㆏]/;

/**
 * Phrase test on normalized text. Latin phrases match on word boundaries so
 * "ink" never fires inside "drink"; scripts without word spacing (Thai,
 * Japanese, Chinese, Korean) match as substrings because boundaries do not
 * exist there.
 */
function containsPhrase(normText: string, normPhrase: string): boolean {
  if (!normPhrase) return false;
  if (NO_WORD_BOUNDARY.test(normPhrase)) return normText.includes(normPhrase);
  const padded = ` ${normText} `;
  return padded.includes(` ${normPhrase} `);
}

// ---------------------------------------------------------------------------
// Vocabularies. Strength matters: one isolated weak word must never reject a
// legitimate studio; strong phrases carry decisions. All phrases are stored
// raw and normalized at module load, so umlaut/hyphen variants collapse.

type Phrase = { phrase: string; strength: "strong" | "weak"; group: string };

const POSITIVE_RAW: Array<[string, "strong" | "weak"]> = [
  ["tattoo", "strong"],
  ["tattoos", "strong"],
  ["tattoo artist", "strong"],
  ["tattooer", "strong"],
  ["tattooist", "strong"],
  ["tattooing", "strong"],
  ["tattoo studio", "strong"],
  ["tattoo shop", "strong"],
  ["tattooshop", "strong"],
  ["tattooatelier", "strong"],
  ["tattoo atelier", "strong"],
  ["custom tattoo", "strong"],
  ["tattoo appointments", "strong"],
  ["tattoo booking", "strong"],
  ["tattoo portfolio", "strong"],
  ["healed tattoos", "strong"],
  ["ink", "weak"],
  ["inked", "weak"],
  ["flash", "weak"],
  ["walk ins", "weak"],
  ["walk in", "weak"],
  ["resident artist", "weak"],
  ["guest artist", "weak"],
  ["sak yant", "strong"],
  ["sakyant", "strong"],
  // German (normalized forms match both umlaut and transliterated spellings).
  ["tätowierer", "strong"],
  ["tätowiererin", "strong"],
  ["tätowierstudio", "strong"],
  ["tattoostudio", "strong"],
  ["tattoo künstler", "strong"],
  ["tattoo künstlerin", "strong"],
  ["tätowierung", "strong"],
  ["tätowierungen", "strong"],
];

const NEGATIVE_RAW: Array<[string, "strong" | "weak", string]> = [
  // Tattoo REMOVAL is tattoo-adjacent but is not a studio: a travelling
  // artist looking for a guest spot must never be sent to a laser clinic.
  ["tattoo removal", "strong", "removal"],
  ["tattoo removals", "strong", "removal"],
  ["tattooremoval", "strong", "removal"],
  ["laser tattoo removal", "strong", "removal"],
  ["tattoo laser removal", "strong", "removal"],
  ["tattooentfernung", "strong", "removal"],
  ["tattoo entfernung", "strong", "removal"],
  ["laserentfernung", "strong", "removal"],
  ["detatouage", "strong", "removal"],
  ["eliminacion de tatuajes", "strong", "removal"],
  ["borrado de tatuajes", "strong", "removal"],
  ["rimozione tatuaggi", "strong", "removal"],
  // Permanent makeup.
  ["permanent makeup", "strong", "pmu"],
  ["permanent make up", "strong", "pmu"],
  ["permanent cosmetics", "strong", "pmu"],
  ["cosmetic tattoo", "strong", "pmu"],
  ["cosmetic tattooing", "strong", "pmu"],
  ["semi permanent makeup", "strong", "pmu"],
  ["pmu", "strong", "pmu"],
  ["pmu artist", "strong", "pmu"],
  ["pmu studio", "strong", "pmu"],
  ["pmu academy", "strong", "pmu"],
  ["micropigmentation", "strong", "pmu"],
  ["micro pigmentation", "strong", "pmu"],
  ["dermopigmentation", "strong", "pmu"],
  ["dermapigmentation", "strong", "pmu"],
  ["makeup tattoo", "strong", "pmu"],
  ["facial tattooing", "strong", "pmu"],
  ["cosmetic pigmentation", "strong", "pmu"],
  ["beauty tattoo", "strong", "pmu"],
  ["medical micropigmentation", "strong", "pmu"],
  // Brows.
  ["microblading", "strong", "brows"],
  ["micro blade", "strong", "brows"],
  ["microblading artist", "strong", "brows"],
  ["microblading studio", "strong", "brows"],
  ["eyebrow tattoo", "strong", "brows"],
  ["brow tattoo", "strong", "brows"],
  ["powder brows", "strong", "brows"],
  ["powder brow", "strong", "brows"],
  ["ombre brows", "strong", "brows"],
  ["nano brows", "strong", "brows"],
  ["nanoblading", "strong", "brows"],
  ["nano blading", "strong", "brows"],
  ["hairstroke brows", "strong", "brows"],
  ["hair stroke brows", "strong", "brows"],
  ["machine brows", "strong", "brows"],
  ["combo brows", "strong", "brows"],
  ["combination brows", "strong", "brows"],
  ["hybrid brows", "strong", "brows"],
  ["3d brows", "strong", "brows"],
  ["6d brows", "strong", "brows"],
  ["feather brows", "strong", "brows"],
  ["mist brows", "strong", "brows"],
  ["pixel brows", "strong", "brows"],
  ["shaded brows", "strong", "brows"],
  ["brow pigmentation", "strong", "brows"],
  ["brow embroidery", "strong", "brows"],
  ["eyebrow embroidery", "strong", "brows"],
  // Bare brow/lash words are a strong PMU signal, not weak: eyebrow/brow shops
  // brand in English worldwide and were being ACCEPTED when the provider
  // category said tattoo (observed at scale on the 2026-07-21 Thailand run,
  // ~40 "X Eyebrows" shops). A real tattoo studio that also lists brows still
  // goes to R-MIXED review via its tattoo positive, not a reject.
  ["eyebrows", "strong", "brows"],
  ["eyebrow", "strong", "brows"],
  ["brows", "strong", "brows"],
  ["brow", "strong", "brows"],
  ["eyelash", "strong", "brows"],
  ["eyelashes", "strong", "brows"],
  ["lash extensions", "strong", "brows"],
  ["lash lift", "strong", "brows"],
  ["lash bar", "strong", "brows"],
  ["brow mapping", "weak", "brows"],
  ["brow correction", "weak", "brows"],
  // Nail salons (often bundled with brow/PMU shops).
  ["nail salon", "strong", "nails"],
  ["nail studio", "strong", "nails"],
  ["nail art", "strong", "nails"],
  ["nail bar", "strong", "nails"],
  ["nails", "strong", "nails"],
  ["manicure", "strong", "nails"],
  ["pedicure", "strong", "nails"],
  // Lips and eyeliner.
  ["lip blush", "strong", "lips"],
  ["lip blushing", "strong", "lips"],
  ["lip tattoo", "strong", "lips"],
  ["permanent lips", "strong", "lips"],
  ["lip pigmentation", "strong", "lips"],
  ["lip micropigmentation", "strong", "lips"],
  ["aquarelle lips", "strong", "lips"],
  ["watercolor lips", "strong", "lips"],
  ["ombre lips", "strong", "lips"],
  ["lip neutralization", "strong", "lips"],
  ["permanent eyeliner", "strong", "lips"],
  ["eyeliner tattoo", "strong", "lips"],
  ["lash line tattoo", "strong", "lips"],
  ["lash enhancement", "strong", "lips"],
  ["winged eyeliner tattoo", "strong", "lips"],
  // Scalp.
  ["scalp micropigmentation", "strong", "smp"],
  ["smp", "strong", "smp"],
  ["smp artist", "strong", "smp"],
  ["smp clinic", "strong", "smp"],
  ["hair tattoo", "strong", "smp"],
  ["hairline tattoo", "strong", "smp"],
  ["scalp pigmentation", "strong", "smp"],
  ["baldness camouflage", "strong", "smp"],
  ["alopecia pigmentation", "strong", "smp"],
  // Paramedical (weak: legitimate studios mention scar cover and areola work).
  ["freckle tattoo", "weak", "paramedical"],
  ["permanent freckles", "weak", "paramedical"],
  ["beauty mark tattoo", "weak", "paramedical"],
  ["scar camouflage", "weak", "paramedical"],
  ["scar pigmentation", "weak", "paramedical"],
  ["stretch mark camouflage", "weak", "paramedical"],
  ["vitiligo camouflage", "weak", "paramedical"],
  ["skin camouflage", "weak", "paramedical"],
  ["paramedical micropigmentation", "strong", "paramedical"],
  ["paramedical tattooing", "strong", "paramedical"],
  ["medical tattooing", "weak", "paramedical"],
  ["areola pigmentation", "weak", "paramedical"],
  ["areola restoration", "weak", "paramedical"],
  ["nipple restoration", "weak", "paramedical"],
  // Beauty business categories.
  ["beauty studio", "strong", "beauty"],
  ["beauty salon", "strong", "beauty"],
  ["beauty clinic", "strong", "beauty"],
  ["beauty lounge", "strong", "beauty"],
  ["beauty bar", "strong", "beauty"],
  ["beauty academy", "strong", "beauty"],
  ["beauty institute", "strong", "beauty"],
  ["beauty center", "strong", "beauty"],
  ["beauty centre", "strong", "beauty"],
  ["beautician", "strong", "beauty"],
  ["cosmetic clinic", "strong", "beauty"],
  ["aesthetic clinic", "strong", "beauty"],
  ["aesthetics clinic", "strong", "beauty"],
  ["aesthetic studio", "strong", "beauty"],
  ["skin clinic", "strong", "beauty"],
  ["brow studio", "strong", "beauty"],
  ["brow bar", "strong", "beauty"],
  ["brow lounge", "strong", "beauty"],
  ["brow academy", "strong", "beauty"],
  ["lash studio", "strong", "beauty"],
  ["lash bar", "strong", "beauty"],
  ["lash lounge", "strong", "beauty"],
  ["nail and beauty", "strong", "beauty"],
  ["hair and beauty", "strong", "beauty"],
  ["makeup artist", "weak", "beauty"],
  ["cosmetologist", "strong", "beauty"],
  ["esthetician", "strong", "beauty"],
  ["aesthetician", "strong", "beauty"],
  // Related beauty services (weak alone; dominance rejects).
  ["brow lamination", "weak", "beauty_services"],
  ["brow tint", "weak", "beauty_services"],
  ["brow shaping", "weak", "beauty_services"],
  ["brow waxing", "weak", "beauty_services"],
  ["brow threading", "weak", "beauty_services"],
  ["henna brows", "weak", "beauty_services"],
  ["lash lift", "weak", "beauty_services"],
  ["lash extensions", "weak", "beauty_services"],
  ["eyelash extensions", "weak", "beauty_services"],
  ["lash tint", "weak", "beauty_services"],
  ["nail salon", "strong", "beauty_services"],
  ["nail artist", "weak", "beauty_services"],
  ["manicure", "weak", "beauty_services"],
  ["pedicure", "weak", "beauty_services"],
  ["facials", "weak", "beauty_services"],
  ["facial treatment", "weak", "beauty_services"],
  ["hydrafacial", "weak", "beauty_services"],
  ["dermaplaning", "weak", "beauty_services"],
  ["chemical peel", "weak", "beauty_services"],
  ["waxing", "weak", "beauty_services"],
  ["threading", "weak", "beauty_services"],
  ["bridal makeup", "weak", "beauty_services"],
  ["laser hair removal", "weak", "beauty_services"],
  ["botox", "weak", "beauty_services"],
  ["fillers", "weak", "beauty_services"],
  ["dermal fillers", "weak", "beauty_services"],
  ["injectables", "weak", "beauty_services"],
  // German (normalized to transliterated forms automatically).
  ["kosmetische tätowierung", "strong", "german"],
  ["kosmetische tätowierungen", "strong", "german"],
  ["kosmetik tattoo", "strong", "german"],
  ["kosmetiktattoo", "strong", "german"],
  ["augenbrauen tattoo", "strong", "german"],
  ["augenbrauentattoo", "strong", "german"],
  ["puder augenbrauen", "strong", "german"],
  ["lippenpigmentierung", "strong", "german"],
  ["wimpernkranzverdichtung", "strong", "german"],
  ["kopfhautpigmentierung", "strong", "german"],
  ["haarpigmentierung", "strong", "german"],
  ["narbenpigmentierung", "weak", "german"],
  ["brustwarzenrekonstruktion", "weak", "german"],
  ["areola pigmentierung", "weak", "german"],
  ["kosmetikstudio", "strong", "german"],
  ["beautystudio", "strong", "german"],
  ["schönheitssalon", "strong", "german"],
  ["kosmetiksalon", "strong", "german"],
  ["kosmetikerin", "strong", "german"],
  ["kosmetiker", "strong", "german"],
  ["ästhetikstudio", "strong", "german"],
  ["ästhetik klinik", "strong", "german"],
  ["schönheitsklinik", "strong", "german"],
  ["augenbrauenstudio", "strong", "german"],
  ["wimpernstudio", "strong", "german"],
  ["nagelstudio", "strong", "german"],
];

function compile(
  raw: Array<[string, "strong" | "weak"] | [string, "strong" | "weak", string]>,
  defaultGroup: string,
): Phrase[] {
  return raw.map((entry) => ({
    phrase: normalizeSeedText(entry[0]),
    strength: entry[1],
    group: (entry[2] as string | undefined) ?? defaultGroup,
  }));
}

const POSITIVE_PHRASES = compile(POSITIVE_RAW, "tattoo");
const NEGATIVE_PHRASES = compile(NEGATIVE_RAW, "beauty");

// Structured categories from providers (Overture etc.).
const TATTOO_CATEGORIES = new Set(["tattoo_and_piercing", "tattoo_parlor", "tattoo"]);
const BEAUTY_CATEGORIES = new Set([
  "beauty_salon",
  "beauty_and_spa",
  "nail_salon",
  "hair_salon",
  "spa",
  "cosmetics_store",
  "eyebrow_services",
  "eyelash_service",
  "makeup_artist",
  "skin_care",
]);
// Categories that are clearly a different business entirely.
const OFF_TOPIC_CATEGORIES = new Set([
  "bar",
  "restaurant",
  "hotel",
  "coffee_shop",
  "cafe",
  "gift_shop",
  "shopping",
  "barber",
  "professional_services",
  "arts_and_entertainment",
]);

// ---------------------------------------------------------------------------
// Evaluation.

export type SeedEvaluationInput = {
  name: string;
  /** Structured provider category (snake_case), when known. */
  category?: string | null;
  /** Any additional free text: bio, website title, snippets, descriptions. */
  extraText?: Array<{ field: string; text: string | null | undefined }>;
};

export type SeedSignal = {
  phrase: string;
  field: string;
  strength: "strong" | "weak";
  group: string;
};

export type SeedEvaluation = {
  decision: SeedDecision;
  confidence: number;
  positiveSignals: SeedSignal[];
  negativeSignals: SeedSignal[];
  firedRules: string[];
  explanation: string;
  rulesetVersion: string;
};

function scanField(
  field: string,
  text: string | null | undefined,
  phrases: Phrase[],
): SeedSignal[] {
  const norm = normalizeSeedText(text);
  if (!norm) return [];
  const out: SeedSignal[] = [];
  for (const p of phrases) {
    if (containsPhrase(norm, p.phrase)) {
      out.push({ phrase: p.phrase, field, strength: p.strength, group: p.group });
    }
  }
  return out;
}

/**
 * Two-layer relevance evaluation. Deterministic, versioned, explainable.
 * Country configs may extend the vocabularies via extraPositive/extraNegative.
 */
export function evaluateSeedCandidate(
  input: SeedEvaluationInput,
  options?: {
    extraPositive?: Phrase[];
    extraNegative?: Phrase[];
  },
): SeedEvaluation {
  const positives = [...POSITIVE_PHRASES, ...(options?.extraPositive ?? [])];
  const negatives = [...NEGATIVE_PHRASES, ...(options?.extraNegative ?? [])];

  const fields: Array<{ field: string; text: string | null | undefined }> = [
    { field: "name", text: input.name },
    ...(input.extraText ?? []),
  ];

  const positiveSignals: SeedSignal[] = [];
  const negativeSignals: SeedSignal[] = [];
  for (const f of fields) {
    positiveSignals.push(...scanField(f.field, f.text, positives));
    negativeSignals.push(...scanField(f.field, f.text, negatives));
  }

  const firedRules: string[] = [];
  const category = (input.category ?? "").trim().toLowerCase();
  const categoryTattoo = TATTOO_CATEGORIES.has(category);
  const categoryBeauty = BEAUTY_CATEGORIES.has(category);
  const categoryOffTopic = OFF_TOPIC_CATEGORIES.has(category);

  if (categoryTattoo) {
    firedRules.push("R-CAT-TATTOO");
    positiveSignals.push({
      phrase: category,
      field: "category",
      strength: "strong",
      group: "category",
    });
  }
  if (categoryBeauty) {
    firedRules.push("R-CAT-BEAUTY");
    negativeSignals.push({
      phrase: category,
      field: "category",
      strength: "strong",
      group: "category",
    });
  }

  // A positive that is only a FRAGMENT of a matched negative in the same
  // field is not independent evidence: the "tattoo" inside "tattoo removal"
  // names the thing being removed, not a studio. Without this, every laser
  // clinic in the country reads as a tattoo studio (observed at scale in
  // the 2026-07-20 US rollout).
  const negPhrasesByField = new Map<string, string[]>();
  for (const n of negativeSignals) {
    negPhrasesByField.set(n.field, [
      ...(negPhrasesByField.get(n.field) ?? []),
      n.phrase,
    ]);
  }
  const subsumed = (s: SeedSignal) =>
    (negPhrasesByField.get(s.field) ?? []).some(
      (neg) => neg !== s.phrase && neg.includes(s.phrase),
    );
  const effectivePos = positiveSignals.filter((s) => !subsumed(s));

  const strongPos = effectivePos.filter((s) => s.strength === "strong");
  const strongNeg = negativeSignals.filter((s) => s.strength === "strong");
  const weakPos = effectivePos.filter((s) => s.strength === "weak");
  const weakNeg = negativeSignals.filter((s) => s.strength === "weak");
  // Removal clinics are tattoo-adjacent but are not studios, so they get
  // their own honest decision label rather than the beauty one.
  const removalOnly =
    strongNeg.length > 0 && strongNeg.every((s) => s.group === "removal");
  // Strong negatives found in the NAME weigh double: "PMU Academy Berlin" is
  // the business identity, not a service mention.
  const strongNegInName = strongNeg.filter((s) => s.field === "name");

  const decide = (
    decision: SeedDecision,
    confidence: number,
    rule: string,
    explanation: string,
  ): SeedEvaluation => {
    firedRules.push(rule);
    return {
      decision,
      // Clamped: the weak-negative penalty in R-ACCEPT is unbounded and the
      // stored value carries a 0..100 CHECK constraint.
      confidence: Math.min(100, Math.max(0, Math.round(confidence))),
      positiveSignals,
      negativeSignals,
      firedRules,
      explanation,
      rulesetVersion: SEED_RULESET_VERSION,
    };
  };

  // Hard rules, most decisive first.
  // A beauty/PMU identity in the NAME with no textual tattoo evidence is a
  // rejection even when the provider category says tattoo: categories are
  // machine-derived and routinely file PMU studios under tattoo (observed
  // at scale in the 2026-07-20 Austria rollout).
  const textualStrongPos = strongPos.filter((s) => s.field !== "category");
  if (strongNegInName.length > 0 && textualStrongPos.length === 0) {
    return decide(
      removalOnly ? "reject_not_tattoo" : "reject_beauty",
      85,
      removalOnly ? "R-NAME-REMOVAL" : "R-NAME-BEAUTY-OVER-CATEGORY",
      removalOnly
        ? `This is a tattoo removal business (${strongNegInName.map((s) => s.phrase).join(", ")}), not a studio.`
        : `The business identity is beauty/PMU (${strongNegInName.map((s) => s.phrase).join(", ")} in the name); the only tattoo evidence is the provider category.`,
    );
  }
  if (strongPos.length > 0 && strongNeg.length > 0) {
    return decide(
      "review_mixed_business",
      50,
      "R-MIXED",
      "Strong conventional tattoo evidence and strong beauty/PMU evidence both present; needs a human look.",
    );
  }
  if (strongNegInName.length > 0) {
    return decide(
      "reject_beauty",
      90,
      "R-NAME-BEAUTY",
      `The business identity is beauty/PMU (${strongNegInName.map((s) => s.phrase).join(", ")} in the name) with no strong tattoo evidence.`,
    );
  }
  if (strongNeg.length >= 2) {
    return decide(
      "reject_beauty",
      85,
      "R-MULTI-BEAUTY",
      "Multiple strong beauty/PMU phrases with no conventional tattoo evidence.",
    );
  }
  if (strongNeg.length === 1 && strongPos.length === 0 && weakPos.length === 0) {
    return decide(
      "reject_beauty",
      75,
      "R-SINGLE-STRONG-BEAUTY",
      `Strong beauty/PMU evidence (${strongNeg[0].phrase}) and no tattoo evidence at all.`,
    );
  }
  if (categoryOffTopic && strongPos.length === 0) {
    return decide(
      "reject_not_tattoo",
      80,
      "R-OFF-TOPIC",
      `Provider categorizes this as ${category} and no tattoo evidence was found.`,
    );
  }
  if (strongPos.length > 0) {
    // Weak negatives alongside strong tattoo evidence never reject alone.
    const confidence = Math.min(
      95,
      60 + strongPos.length * 10 + (categoryTattoo ? 10 : 0) - weakNeg.length * 5,
    );
    if (confidence < MIN_AUTOMATED_CONFIDENCE) {
      return decide(
        "review_ambiguous",
        confidence,
        "R-LOW-CONFIDENCE",
        "Tattoo evidence exists but confidence is below the automatic-import threshold.",
      );
    }
    return decide(
      "accept_automated",
      confidence,
      "R-ACCEPT",
      `Conventional tattoo evidence (${[...new Set(strongPos.map((s) => s.phrase))].slice(0, 3).join(", ")}) with no strong beauty/PMU evidence.`,
    );
  }
  if (weakPos.length > 0 && weakNeg.length > 0) {
    return decide(
      "review_ambiguous",
      40,
      "R-WEAK-BOTH",
      "Only weak signals on both sides; needs a human look.",
    );
  }
  if (weakPos.length > 0) {
    return decide(
      "reject_insufficient_evidence",
      55,
      "R-WEAK-ONLY",
      "Only weak tattoo hints (for example flash or walk-ins) without corroborating evidence.",
    );
  }
  return decide(
    "reject_insufficient_evidence",
    70,
    "R-NO-EVIDENCE",
    "No tattoo evidence in any field.",
  );
}

export type { Phrase as SeedVocabularyPhrase };
export function compileSeedVocabulary(
  raw: Array<[string, "strong" | "weak"]>,
  group: string,
): Phrase[] {
  return compile(raw, group);
}

// ---------------------------------------------------------------------------
// Decision composition helpers, shared by every lane so the manual and
// automated workflows can never diverge on what a decision means.

/**
 * Merge a relevance decision with a duplicate-detection result. Certain hits
 * are duplicates; softer hits go to review. A hit on a claimed studio is
 * always a hard duplicate: automation must never even approach claimed data.
 * Rejections stand regardless (the duplicate evidence is still recorded).
 */
export function applySeedDuplicateDecision(
  decision: SeedDecision,
  duplicate: { confidence: "clear" | "likely" | "possible" } | null,
  claimedHit: boolean,
): SeedDecision {
  if (!duplicate) return decision;
  if (decision.startsWith("reject") || decision === "failed_validation")
    return decision;
  if (claimedHit) return "duplicate";
  if (duplicate.confidence === "clear") return "duplicate";
  return "possible_duplicate";
}

/**
 * Candidate status (the manual review queue vocabulary) for a decision.
 * Review decisions stay "new" so they surface in the existing admin queue;
 * only accept_automated may proceed to conversion.
 */
export function statusForSeedDecision(decision: SeedDecision): string {
  switch (decision) {
    case "accept_automated":
      return "approved_for_enrichment";
    case "reject_beauty":
    case "reject_not_tattoo":
    case "reject_insufficient_evidence":
    case "failed_validation":
      return "rejected";
    case "duplicate":
      return "likely_duplicate";
    case "review_mixed_business":
    case "review_ambiguous":
    case "possible_duplicate":
    default:
      return "new";
  }
}
