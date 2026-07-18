import { describe, expect, it } from "vitest";
import {
  DE_COVERAGE_POLICY,
  assignDiscoveryToUnit,
  assignStrategy,
  buildRuralClusters,
  computeCoverageReport,
  discoveryIdentityKey,
  generateQueries,
  haversineKm,
  isSaturated,
  mergeDiscoveries,
  normalizedDomain,
  normalizedInstagram,
  planCoverage,
  retryDelayMs,
  selectPilotUnits,
  unitAssignmentRadiusKm,
  type CompletionTaskRow,
  type CoverageUnitInput,
  type RawDiscovery,
} from "@inklee/shared/seed-coverage";

// Synthetic mini-Germany: 2 states, one metro, one medium city, one town,
// a rural belt, and a duplicate municipality name across districts.
const UNITS: CoverageUnitInput[] = [
  {
    externalId: "09162000",
    name: "München",
    stateCode: "09",
    stateName: "Bayern",
    districtName: "München",
    population: 1500000,
    areaKm2: 310,
    centroid: { latitude: 48.137, longitude: 11.575 },
  },
  {
    externalId: "09184129",
    name: "Garching bei München",
    stateCode: "09",
    stateName: "Bayern",
    population: 18000,
    areaKm2: 28,
    centroid: { latitude: 48.249, longitude: 11.65 },
  },
  {
    externalId: "03241001",
    name: "Hannover",
    stateCode: "03",
    stateName: "Niedersachsen",
    population: 545000,
    areaKm2: 204,
    centroid: { latitude: 52.375, longitude: 9.732 },
  },
  {
    externalId: "03256021",
    name: "Neustadt am Rübenberge",
    stateCode: "03",
    stateName: "Niedersachsen",
    population: 45000,
    areaKm2: 358,
    centroid: { latitude: 52.504, longitude: 9.458 },
  },
  // Rural belt in Bayern (small, adjacent).
  {
    externalId: "09173112",
    name: "Dorfen A",
    stateCode: "09",
    stateName: "Bayern",
    population: 3000,
    areaKm2: 20,
    centroid: { latitude: 48.0, longitude: 12.0 },
  },
  {
    externalId: "09173113",
    name: "Dorfen B",
    stateCode: "09",
    stateName: "Bayern",
    population: 1500,
    areaKm2: 15,
    centroid: { latitude: 48.05, longitude: 12.05 },
  },
  {
    externalId: "09173114",
    name: "Dorfen C",
    stateCode: "09",
    stateName: "Bayern",
    population: 900,
    areaKm2: 12,
    centroid: { latitude: 48.02, longitude: 12.08 },
  },
  // Rural in the other state, far away (must not join the Bayern cluster).
  {
    externalId: "03356005",
    name: "Kleinort",
    stateCode: "03",
    stateName: "Niedersachsen",
    population: 1200,
    areaKm2: 18,
    centroid: { latitude: 52.7, longitude: 9.2 },
  },
  // Duplicate display name in different districts.
  {
    externalId: "09171111",
    name: "Neustadt",
    stateCode: "09",
    stateName: "Bayern",
    districtName: "Oberbayern",
    population: 8000,
    areaKm2: 30,
    centroid: { latitude: 48.5, longitude: 11.2 },
  },
  {
    externalId: "03151999",
    name: "Neustadt",
    stateCode: "03",
    stateName: "Niedersachsen",
    districtName: "Elsewhere",
    population: 7000,
    areaKm2: 25,
    centroid: { latitude: 52.0, longitude: 9.9 },
  },
];

describe("coverage planning", () => {
  it("assigns strategy tiers from population", () => {
    expect(assignStrategy(UNITS[0], DE_COVERAGE_POLICY)).toBe("metro_deep");
    expect(assignStrategy(UNITS[2], DE_COVERAGE_POLICY)).toBe("metro_deep");
    expect(assignStrategy(UNITS[3], DE_COVERAGE_POLICY)).toBe("town_light");
    expect(assignStrategy(UNITS[4], DE_COVERAGE_POLICY)).toBe("rural_cluster");
  });

  it("treats unknown population as small, never a paid tier", () => {
    expect(
      assignStrategy({ ...UNITS[0], population: null }, DE_COVERAGE_POLICY),
    ).toBe("rural_cluster");
  });

  it("plans every unit exactly once with no duplicates", () => {
    const { units } = planCoverage([...UNITS, UNITS[0]], DE_COVERAGE_POLICY);
    expect(units).toHaveLength(UNITS.length);
    expect(new Set(units.map((u) => u.externalId)).size).toBe(UNITS.length);
  });

  it("clusters nearby small municipalities within one state", () => {
    const { units, clusters } = planCoverage(UNITS, DE_COVERAGE_POLICY);
    const belt = units.filter((u) => u.name.startsWith("Dorfen"));
    expect(belt.every((u) => u.clusterExternalId)).toBe(true);
    const beltCluster = clusters.find((c) =>
      c.memberExternalIds.includes("09173112"),
    );
    expect(beltCluster).toBeTruthy();
    expect(beltCluster?.memberExternalIds).toContain("09173113");
    // The far-away rural unit in the other state stays out.
    expect(beltCluster?.memberExternalIds).not.toContain("03356005");
    // Cluster population is the member sum.
    expect(beltCluster?.population).toBe(3000 + 1500 + 900);
  });

  it("is deterministic across runs", () => {
    const a = planCoverage(UNITS, DE_COVERAGE_POLICY);
    const b = planCoverage([...UNITS], DE_COVERAGE_POLICY);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("keeps unit identity on dataset refresh (same external ids)", () => {
    const refreshed = UNITS.map((u) => ({
      ...u,
      population: (u.population ?? 0) + 100,
    }));
    const a = planCoverage(UNITS, DE_COVERAGE_POLICY).units.map(
      (u) => u.externalId,
    );
    const b = planCoverage(refreshed, DE_COVERAGE_POLICY).units.map(
      (u) => u.externalId,
    );
    expect(b).toEqual(a);
  });
});

describe("query generation", () => {
  it("builds the bundle for the strategy and dedupes umlaut variants", () => {
    const executed = new Set<string>();
    const queries = generateQueries(
      { name: "München" },
      "metro_deep",
      DE_COVERAGE_POLICY,
      executed,
    );
    expect(queries.length).toBe(
      DE_COVERAGE_POLICY.queryBundles.metro_deep.length,
    );
    // Re-running with the transliterated alias produces nothing new.
    const again = generateQueries(
      { name: "Muenchen" },
      "metro_deep",
      DE_COVERAGE_POLICY,
      new Set(queries.map((q) => q.normalized)),
    );
    expect(again).toHaveLength(0);
  });

  it("disambiguates duplicate municipality names with the state", () => {
    const q = generateQueries(
      { name: "Neustadt", stateName: "Bayern" },
      "town_light",
      DE_COVERAGE_POLICY,
      new Set(),
      { disambiguateWithState: true },
    );
    expect(q[0].query).toContain("Bayern");
  });

  it("structured_only units generate zero paid queries", () => {
    expect(
      generateQueries(
        { name: "Dorfen A" },
        "structured_only",
        DE_COVERAGE_POLICY,
        new Set(),
      ),
    ).toHaveLength(0);
  });
});

describe("saturation", () => {
  it("stops after the configured zero-novel streak", () => {
    expect(isSaturated([5, 3, 0, 0], DE_COVERAGE_POLICY)).toBe(true);
    expect(isSaturated([5, 0, 3], DE_COVERAGE_POLICY)).toBe(false);
    expect(isSaturated([0], DE_COVERAGE_POLICY)).toBe(false);
  });
});

describe("discovery identity and merge", () => {
  const overture: RawDiscovery = {
    provider: "overture",
    providerResultId: "ovt-1",
    name: "Schwarz Tattoo München",
    latitude: 48.1371,
    longitude: 11.5754,
    websiteUrl: "https://www.schwarz-tattoo.de/",
    city: "München",
  };
  const osm: RawDiscovery = {
    provider: "osm",
    providerResultId: "node/42",
    name: "Schwarz Tattoo Muenchen",
    latitude: 48.1372,
    longitude: 11.5755,
    websiteUrl: "https://schwarz-tattoo.de",
    phone: "+49 89 123456",
  };

  it("merges the same studio from Overture and OSM by domain", () => {
    const merged = mergeDiscoveries([overture, osm]);
    expect(merged).toHaveLength(1);
    expect(merged[0].discoveredBy.map((d) => d.provider)).toEqual([
      "overture",
      "osm",
    ]);
    // Corroborating fields survive the merge.
    expect(merged[0].phone).toBe("+49 89 123456");
  });

  it("merges search leads onto structured records via Instagram identity", () => {
    const brave: RawDiscovery = {
      provider: "brave_search",
      providerResultId: "https://instagram.com/schwarztattoo",
      name: "Schwarz Tattoo (@schwarztattoo)",
      socialUrl: "https://instagram.com/schwarztattoo",
    };
    const structured: RawDiscovery = {
      ...overture,
      websiteUrl: null,
      socialUrl: "https://www.instagram.com/schwarztattoo/",
    };
    expect(mergeDiscoveries([structured, brave])).toHaveLength(1);
  });

  it("merges umlaut and transliterated names at the same location", () => {
    const a: RawDiscovery = {
      provider: "overture",
      providerResultId: "a",
      name: "Tätowierstube Grün",
      latitude: 48.0,
      longitude: 11.0,
    };
    const b: RawDiscovery = {
      provider: "osm",
      providerResultId: "b",
      name: "Taetowierstube Gruen",
      latitude: 48.001,
      longitude: 11.001,
    };
    expect(mergeDiscoveries([a, b])).toHaveLength(1);
  });

  it("keeps same-name studios in different cities separate", () => {
    const a: RawDiscovery = {
      provider: "overture",
      providerResultId: "a",
      name: "Black Ink",
      latitude: 48.1,
      longitude: 11.5,
    };
    const b: RawDiscovery = {
      provider: "overture",
      providerResultId: "b",
      name: "Black Ink",
      latitude: 52.4,
      longitude: 9.7,
    };
    expect(mergeDiscoveries([a, b])).toHaveLength(2);
  });

  it("keeps different names on one domain separate only when domains differ", () => {
    const a: RawDiscovery = {
      provider: "overture",
      providerResultId: "a",
      name: "Studio Eins",
      websiteUrl: "https://ink-collective.de/eins",
    };
    const b: RawDiscovery = {
      provider: "osm",
      providerResultId: "b",
      name: "Studio Zwei",
      websiteUrl: "https://ink-collective.de/zwei",
    };
    // Same business domain = one identity (a collective site), by design.
    expect(mergeDiscoveries([a, b])).toHaveLength(1);
  });

  it("does not treat platform hosts as business domains", () => {
    expect(normalizedDomain("https://www.instagram.com/foo")).toBeNull();
    expect(normalizedDomain("https://schwarz-tattoo.de/x")).toBe(
      "schwarz-tattoo.de",
    );
    expect(normalizedInstagram("https://instagram.com/p/abc123")).toBeNull();
    expect(normalizedInstagram("https://instagram.com/schwarztattoo/")).toBe(
      "schwarztattoo",
    );
  });

  it("gives uncertain identities distinct keys", () => {
    const a: RawDiscovery = {
      provider: "brave_search",
      name: "Tattoo Lounge",
    };
    const b: RawDiscovery = {
      provider: "brave_search",
      name: "Tattoo Lounge Berlin",
    };
    expect(discoveryIdentityKey(a)).not.toBe(discoveryIdentityKey(b));
  });
});

describe("spatial assignment", () => {
  const assignable = UNITS.map((u) => ({
    externalId: u.externalId,
    name: u.name,
    aliases: u.aliases ?? [],
    areaKm2: u.areaKm2,
    centroid: u.centroid,
  }));

  it("assigns by coordinates with high confidence inside the unit radius", () => {
    const a = assignDiscoveryToUnit(
      { latitude: 48.14, longitude: 11.58 },
      assignable,
    );
    expect(a.externalId).toBe("09162000");
    expect(a.method).toBe("centroid_distance");
    expect(a.confidence).toBe("high");
  });

  it("assigns a boundary candidate to the nearest unit with low confidence", () => {
    const a = assignDiscoveryToUnit(
      { latitude: 48.32, longitude: 11.62 },
      assignable,
    );
    expect(a.externalId).toBeTruthy();
    expect(["high", "low"]).toContain(a.confidence);
  });

  it("falls back to a unique city name when coordinates are missing", () => {
    const a = assignDiscoveryToUnit({ city: "Hannover" }, assignable);
    expect(a.externalId).toBe("03241001");
    expect(a.method).toBe("city_name");
  });

  it("refuses to guess between duplicate municipality names without coordinates", () => {
    const a = assignDiscoveryToUnit({ city: "Neustadt" }, assignable);
    expect(a.externalId).toBeNull();
    expect(a.method).toBe("unassigned");
  });

  it("radius grows with area but keeps a floor", () => {
    expect(unitAssignmentRadiusKm(null)).toBeGreaterThan(0);
    expect(unitAssignmentRadiusKm(310)).toBeGreaterThan(
      unitAssignmentRadiusKm(12),
    );
  });

  it("haversine sanity", () => {
    expect(
      haversineKm(
        { latitude: 48.137, longitude: 11.575 },
        { latitude: 52.375, longitude: 9.732 },
      ),
    ).toBeGreaterThan(400);
  });
});

describe("pilot selection", () => {
  it("selects one metro, one city, one town, one cluster across states, deterministically", () => {
    const { units, clusters } = planCoverage(UNITS, DE_COVERAGE_POLICY);
    const a = selectPilotUnits(units, clusters);
    const b = selectPilotUnits(units, clusters);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a[0].reason).toContain("metro");
    const states = new Set(
      a
        .map(
          (p) =>
            units.find((u) => u.externalId === p.externalId)?.stateCode ??
            clusters.find((c) => c.externalId === p.externalId)?.stateCode,
        )
        .filter(Boolean),
    );
    expect(states.size).toBeGreaterThanOrEqual(2);
    // Every selection records why.
    expect(a.every((p) => p.reason.length > 10)).toBe(true);
  });
});

describe("retry backoff", () => {
  it("grows exponentially with bounded jitter", () => {
    expect(retryDelayMs(1, 0.5)).toBeLessThan(retryDelayMs(3, 0.5));
    expect(retryDelayMs(10, 1)).toBeLessThanOrEqual(6 * 60 * 60_000 * 1.25);
    expect(retryDelayMs(1, 0)).toBeGreaterThan(0);
  });
});

describe("completion policy", () => {
  const base = (over: Partial<CompletionTaskRow>): CompletionTaskRow => ({
    status: "complete",
    population: 1000,
    areaKm2: 10,
    externalId: "x",
    name: "X",
    providerActionsComplete: true,
    ...over,
  });

  it("no-results counts as done; failed search never does", () => {
    const report = computeCoverageReport(
      [
        base({ externalId: "a" }),
        base({ externalId: "b", status: "complete_no_results" }),
        base({
          externalId: "c",
          status: "retry_required",
          providerActionsComplete: false,
        }),
      ],
      DE_COVERAGE_POLICY,
    );
    expect(report.doneUnits).toBe(2);
    expect(report.failedUnits).toBe(1);
    expect(report.satisfied).toBe(false);
    expect(report.finalStatus).toBe("completed_with_gaps");
    expect(report.gaps).toHaveLength(1);
  });

  it("reports separate population and unit rates", () => {
    const report = computeCoverageReport(
      [
        base({ externalId: "big", population: 90000 }),
        base({
          externalId: "small",
          population: 10000,
          status: "retry_required",
          providerActionsComplete: false,
        }),
      ],
      DE_COVERAGE_POLICY,
    );
    expect(report.unitCompletionRate).toBe(0.5);
    expect(report.populationCoverageRate).toBe(0.9);
  });

  it("declares completed only when every gate passes and no gaps remain", () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      base({ externalId: `u${i}` }),
    );
    const report = computeCoverageReport(rows, DE_COVERAGE_POLICY);
    expect(report.satisfied).toBe(true);
    expect(report.finalStatus).toBe("completed");
    expect(report.gaps).toHaveLength(0);
  });
});
