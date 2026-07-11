import { describe, expect, it } from "vitest";
import { buildInsights, type InsightsBundle } from "../insights";
import type { Insight } from "../types";

/** A bundle that trips no rule at all; tests override single slices. */
function baseBundle(overrides: Partial<InsightsBundle> = {}): InsightsBundle {
  return {
    periodLabel: "Last 30 days",
    minSampleSize: 5,
    changeThresholdPct: 20,
    activationRate: { current: null, previous: null, currentN: 0 },
    sources: [],
    overallActivationPct: null,
    authSignups: 0,
    profilesClaimed: 0,
    medianDaysToFirstRequest: { current: null, previous: null, currentN: 0 },
    depositFailures: { current: 0, previous: 0 },
    lifecycle: [],
    activatedInactive: 0,
    activatedTotal: 0,
    featureRetention: [],
    ...overrides,
  };
}

function byId(insights: Insight[], id: string): Insight | undefined {
  return insights.find((insight) => insight.id === id);
}

describe("buildInsights: empty bundle", () => {
  it("returns an empty array when nothing crosses a threshold", () => {
    expect(buildInsights(baseBundle())).toEqual([]);
  });
});

describe("rule 1: activation rate shift", () => {
  // changeThresholdPct 20 means the rule fires at an absolute shift of 10
  // percentage points or more (threshold / 2).
  it("fires as attention on a drop of exactly threshold/2 points", () => {
    const insights = buildInsights(
      baseBundle({
        activationRate: { current: 30, previous: 40, currentN: 10 },
      }),
    );
    const insight = byId(insights, "activation-rate-shift");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("attention");
    expect(insight!.title).toContain("decreased");
    expect(insight!.currentValue).toBe("30%");
    expect(insight!.comparisonValue).toBe("40%");
  });

  it("fires as info on an increase of exactly threshold/2 points", () => {
    const insights = buildInsights(
      baseBundle({
        activationRate: { current: 50, previous: 40, currentN: 10 },
      }),
    );
    const insight = byId(insights, "activation-rate-shift");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("info");
    expect(insight!.title).toContain("increased");
  });

  it("stays silent one point below the threshold in both directions", () => {
    expect(
      buildInsights(
        baseBundle({
          activationRate: { current: 31, previous: 40, currentN: 10 },
        }),
      ),
    ).toEqual([]);
    expect(
      buildInsights(
        baseBundle({
          activationRate: { current: 49, previous: 40, currentN: 10 },
        }),
      ),
    ).toEqual([]);
  });

  it("stays silent when the previous rate is zero or missing", () => {
    expect(
      buildInsights(
        baseBundle({
          activationRate: { current: 50, previous: 0, currentN: 10 },
        }),
      ),
    ).toEqual([]);
    expect(
      buildInsights(
        baseBundle({
          activationRate: { current: 50, previous: null, currentN: 10 },
        }),
      ),
    ).toEqual([]);
    expect(
      buildInsights(
        baseBundle({
          activationRate: { current: null, previous: 40, currentN: 10 },
        }),
      ),
    ).toEqual([]);
  });

  it("attaches a sample warning when the cohort is below the minimum", () => {
    const insights = buildInsights(
      baseBundle({
        activationRate: { current: 10, previous: 40, currentN: 3 },
      }),
    );
    expect(byId(insights, "activation-rate-shift")!.sampleWarning).toBe(
      "Sample of 3, below the configured minimum of 5.",
    );
  });

  it("attaches no sample warning at or above the minimum", () => {
    const insights = buildInsights(
      baseBundle({
        activationRate: { current: 10, previous: 40, currentN: 5 },
      }),
    );
    expect(byId(insights, "activation-rate-shift")!.sampleWarning).toBeNull();
  });
});

describe("rule 2: weak acquisition source", () => {
  it("fires when a source with enough signups activates at under half the average", () => {
    const insights = buildInsights(
      baseBundle({
        overallActivationPct: 40,
        sources: [{ source: "instagram", signups: 10, activated: 1 }],
      }),
    );
    const insight = byId(insights, "weak-source-instagram");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("watch");
    expect(insight!.currentValue).toBe("10%");
    expect(insight!.segment).toBe("instagram");
  });

  it("stays silent at exactly half the overall average", () => {
    const insights = buildInsights(
      baseBundle({
        overallActivationPct: 40,
        sources: [{ source: "instagram", signups: 10, activated: 2 }],
      }),
    );
    expect(insights).toEqual([]);
  });

  it("stays silent below the minimum sample even at zero activation", () => {
    const insights = buildInsights(
      baseBundle({
        overallActivationPct: 40,
        sources: [{ source: "instagram", signups: 4, activated: 0 }],
      }),
    );
    expect(insights).toEqual([]);
  });

  it("stays silent when the overall activation rate is unknown", () => {
    const insights = buildInsights(
      baseBundle({
        overallActivationPct: null,
        sources: [{ source: "instagram", signups: 10, activated: 0 }],
      }),
    );
    expect(insights).toEqual([]);
  });
});

describe("rule 3: pre-claim drop", () => {
  it("fires at a claim rate of exactly 60 percent", () => {
    const insights = buildInsights(
      baseBundle({ authSignups: 10, profilesClaimed: 6 }),
    );
    const insight = byId(insights, "pre-claim-drop");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("attention");
    expect(insight!.currentValue).toBe("60% claimed");
  });

  it("stays silent at 61 percent", () => {
    expect(
      buildInsights(baseBundle({ authSignups: 100, profilesClaimed: 61 })),
    ).toEqual([]);
  });

  it("stays silent below the minimum signup sample", () => {
    expect(
      buildInsights(baseBundle({ authSignups: 4, profilesClaimed: 0 })),
    ).toEqual([]);
  });
});

describe("rule 4: median time to first request increased", () => {
  // previous 10 days with threshold 20 percent puts the cutoff at 12 days;
  // the current median must be strictly greater.
  it("fires when the current median exceeds previous * (1 + threshold/100)", () => {
    const insights = buildInsights(
      baseBundle({
        medianDaysToFirstRequest: { current: 13, previous: 10, currentN: 10 },
      }),
    );
    const insight = byId(insights, "time-to-first-request-up");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("watch");
    expect(insight!.currentValue).toBe("13 days");
    expect(insight!.comparisonValue).toBe("10 days");
  });

  it("stays silent at exactly previous * (1 + threshold/100)", () => {
    expect(
      buildInsights(
        baseBundle({
          medianDaysToFirstRequest: { current: 12, previous: 10, currentN: 10 },
        }),
      ),
    ).toEqual([]);
  });

  it("stays silent when the median decreased", () => {
    expect(
      buildInsights(
        baseBundle({
          medianDaysToFirstRequest: { current: 8, previous: 10, currentN: 10 },
        }),
      ),
    ).toEqual([]);
  });

  it("stays silent when either side is missing or previous is zero", () => {
    expect(
      buildInsights(
        baseBundle({
          medianDaysToFirstRequest: {
            current: 13,
            previous: null,
            currentN: 10,
          },
        }),
      ),
    ).toEqual([]);
    expect(
      buildInsights(
        baseBundle({
          medianDaysToFirstRequest: {
            current: null,
            previous: 10,
            currentN: 10,
          },
        }),
      ),
    ).toEqual([]);
    expect(
      buildInsights(
        baseBundle({
          medianDaysToFirstRequest: { current: 13, previous: 0, currentN: 10 },
        }),
      ),
    ).toEqual([]);
  });

  it("attaches a sample warning when the cohort is small", () => {
    const insights = buildInsights(
      baseBundle({
        medianDaysToFirstRequest: { current: 13, previous: 10, currentN: 2 },
      }),
    );
    expect(byId(insights, "time-to-first-request-up")!.sampleWarning).toBe(
      "Sample of 2, below the configured minimum of 5.",
    );
  });
});

describe("rule 5: deposit failures increased", () => {
  it("fires at three or more failures when they increased", () => {
    const insights = buildInsights(
      baseBundle({ depositFailures: { current: 3, previous: 2 } }),
    );
    const insight = byId(insights, "deposit-failures-up");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("attention");
    expect(insight!.currentValue).toBe("3");
    expect(insight!.comparisonValue).toBe("2");
  });

  it("fires when the previous period had zero failures", () => {
    const insights = buildInsights(
      baseBundle({ depositFailures: { current: 5, previous: 0 } }),
    );
    expect(byId(insights, "deposit-failures-up")).toBeDefined();
  });

  it("stays silent below three failures even when they increased", () => {
    expect(
      buildInsights(
        baseBundle({ depositFailures: { current: 2, previous: 0 } }),
      ),
    ).toEqual([]);
  });

  it("stays silent when failures did not increase", () => {
    expect(
      buildInsights(
        baseBundle({ depositFailures: { current: 3, previous: 3 } }),
      ),
    ).toEqual([]);
    expect(
      buildInsights(
        baseBundle({ depositFailures: { current: 3, previous: 4 } }),
      ),
    ).toEqual([]);
  });
});

describe("rule 6: lifecycle opened but rarely converted", () => {
  it("fires at open >= 40 percent and conversion <= 5 percent with enough sends", () => {
    const insights = buildInsights(
      baseBundle({
        lifecycle: [
          {
            definitionKey: "books_open_live",
            sent: 100,
            opened: 40,
            associatedConversions: 5,
          },
        ],
      }),
    );
    const insight = byId(insights, "lifecycle-weak-conversion-books_open_live");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("watch");
    expect(insight!.currentValue).toBe("5% associated conversion");
    expect(insight!.comparisonValue).toBe("40% opened");
    expect(insight!.period).toBe("all sends");
  });

  it("stays silent at 39 percent opened", () => {
    expect(
      buildInsights(
        baseBundle({
          lifecycle: [
            {
              definitionKey: "books_open_live",
              sent: 100,
              opened: 39,
              associatedConversions: 0,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("stays silent at 6 percent conversion", () => {
    expect(
      buildInsights(
        baseBundle({
          lifecycle: [
            {
              definitionKey: "books_open_live",
              sent: 100,
              opened: 50,
              associatedConversions: 6,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("stays silent below the minimum send sample", () => {
    expect(
      buildInsights(
        baseBundle({
          lifecycle: [
            {
              definitionKey: "books_open_live",
              sent: 4,
              opened: 4,
              associatedConversions: 0,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("rule 7: activated artists gone quiet", () => {
  it("fires at exactly 30 percent inactive with enough activated artists", () => {
    const insights = buildInsights(
      baseBundle({ activatedInactive: 3, activatedTotal: 10 }),
    );
    const insight = byId(insights, "activated-dormant");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("attention");
    expect(insight!.currentValue).toBe("30%");
  });

  it("stays silent at 29 percent", () => {
    expect(
      buildInsights(baseBundle({ activatedInactive: 29, activatedTotal: 100 })),
    ).toEqual([]);
  });

  it("stays silent below the minimum activated sample", () => {
    expect(
      buildInsights(baseBundle({ activatedInactive: 4, activatedTotal: 4 })),
    ).toEqual([]);
  });
});

describe("rule 8: feature adoption associated with retention", () => {
  it("fires at exactly a 25-point retention gap with enough adopters", () => {
    const insights = buildInsights(
      baseBundle({
        featureRetention: [
          {
            feature: "flash",
            adopters: 10,
            adopterRetainedPct: 75,
            nonAdopterRetainedPct: 50,
          },
        ],
      }),
    );
    const insight = byId(insights, "feature-retention-flash");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("info");
    expect(insight!.currentValue).toBe("75%");
    expect(insight!.comparisonValue).toBe("50%");
  });

  it("stays silent at a 24-point gap", () => {
    expect(
      buildInsights(
        baseBundle({
          featureRetention: [
            {
              feature: "flash",
              adopters: 10,
              adopterRetainedPct: 74,
              nonAdopterRetainedPct: 50,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("stays silent when either retention side is unknown", () => {
    expect(
      buildInsights(
        baseBundle({
          featureRetention: [
            {
              feature: "flash",
              adopters: 10,
              adopterRetainedPct: 90,
              nonAdopterRetainedPct: null,
            },
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      buildInsights(
        baseBundle({
          featureRetention: [
            {
              feature: "flash",
              adopters: 10,
              adopterRetainedPct: null,
              nonAdopterRetainedPct: 10,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("stays silent below the minimum adopter sample", () => {
    expect(
      buildInsights(
        baseBundle({
          featureRetention: [
            {
              feature: "flash",
              adopters: 4,
              adopterRetainedPct: 100,
              nonAdopterRetainedPct: 0,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("output ordering and wording", () => {
  const everything = baseBundle({
    activationRate: { current: 20, previous: 40, currentN: 10 },
    overallActivationPct: 40,
    sources: [{ source: "instagram", signups: 10, activated: 1 }],
    authSignups: 10,
    profilesClaimed: 5,
    medianDaysToFirstRequest: { current: 20, previous: 10, currentN: 10 },
    depositFailures: { current: 5, previous: 1 },
    lifecycle: [
      {
        definitionKey: "books_open_live",
        sent: 10,
        opened: 5,
        associatedConversions: 0,
      },
    ],
    activatedInactive: 5,
    activatedTotal: 10,
    featureRetention: [
      {
        feature: "flash",
        adopters: 10,
        adopterRetainedPct: 80,
        nonAdopterRetainedPct: 40,
      },
    ],
  });

  it("fires all eight rules on a fully triggering bundle", () => {
    const insights = buildInsights(everything);
    expect(insights).toHaveLength(8);
    expect(insights.map((insight) => insight.id).sort()).toEqual(
      [
        "activated-dormant",
        "activation-rate-shift",
        "deposit-failures-up",
        "feature-retention-flash",
        "lifecycle-weak-conversion-books_open_live",
        "pre-claim-drop",
        "time-to-first-request-up",
        "weak-source-instagram",
      ].sort(),
    );
  });

  it("sorts attention first, then watch, then info", () => {
    const severities = buildInsights(everything).map(
      (insight) => insight.severity,
    );
    expect(severities).toEqual([
      "attention",
      "attention",
      "attention",
      "attention",
      "watch",
      "watch",
      "watch",
      "info",
    ]);
  });

  it("never uses causal wording in any title, body or suggestion", () => {
    const causal = /\b(caused|because|drives)\b/i;
    for (const insight of buildInsights(everything)) {
      expect(insight.title).not.toMatch(causal);
      expect(insight.body).not.toMatch(causal);
      expect(insight.suggestion).not.toMatch(causal);
    }
  });
});
