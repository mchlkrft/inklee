import { describe, expect, it } from "vitest";
import {
  isClientEmittableArtistEvent,
  computeHubMetrics,
  computeDailyMetrics,
  computeTopLinks,
  hubAnalyticsCutoffIso,
  type ArtistPageRollup,
} from "@inklee/shared/artist-analytics";
import { formatCentsEur } from "@inklee/shared/fee-savings";

function rollup(overrides: Partial<ArtistPageRollup> = {}): ArtistPageRollup {
  return {
    id: "r1",
    artist_id: "a1",
    roll_date: "2026-07-01",
    surface: "hub",
    event: "page_view",
    target_key: null,
    event_count: 1,
    unique_visitors: 1,
    ...overrides,
  };
}

describe("isClientEmittableArtistEvent", () => {
  it("allows link_click and block_click", () => {
    expect(isClientEmittableArtistEvent("link_click")).toBe(true);
    expect(isClientEmittableArtistEvent("block_click")).toBe(true);
  });

  it("rejects server-only event types", () => {
    expect(isClientEmittableArtistEvent("page_view")).toBe(false);
    expect(isClientEmittableArtistEvent("booking_submitted")).toBe(false);
    expect(isClientEmittableArtistEvent("goods_order_completed")).toBe(false);
  });

  it("rejects unknown names", () => {
    expect(isClientEmittableArtistEvent("")).toBe(false);
    expect(isClientEmittableArtistEvent("made_up")).toBe(false);
    expect(isClientEmittableArtistEvent("LINK_CLICK")).toBe(false);
  });

  it("rejects prototype-chain names", () => {
    expect(isClientEmittableArtistEvent("constructor")).toBe(false);
    expect(isClientEmittableArtistEvent("toString")).toBe(false);
    expect(isClientEmittableArtistEvent("hasOwnProperty")).toBe(false);
  });
});

describe("computeHubMetrics", () => {
  it("aggregates all event types correctly", () => {
    const rollups: ArtistPageRollup[] = [
      rollup({ event: "page_view", event_count: 100, unique_visitors: 80 }),
      rollup({ event: "link_click", event_count: 20, unique_visitors: 15 }),
      rollup({ event: "block_click", event_count: 5, unique_visitors: 4 }),
      rollup({
        event: "booking_submitted",
        event_count: 3,
        unique_visitors: 0,
        surface: "booking_form",
      }),
      rollup({
        event: "goods_order_completed",
        event_count: 2,
        unique_visitors: 0,
        surface: "shop",
      }),
    ];

    const m = computeHubMetrics(rollups);
    expect(m.pageViews).toBe(100);
    expect(m.uniqueVisitors).toBe(80);
    expect(m.linkClicks).toBe(20);
    expect(m.blockClicks).toBe(5);
    expect(m.clickThroughRate).toBe(25);
    expect(m.bookingConversions).toBe(3);
    expect(m.goodsConversions).toBe(2);
    expect(m.conversionRate).toBeCloseTo(6.25, 2);
  });

  it("returns zeroes for empty input", () => {
    const m = computeHubMetrics([]);
    expect(m.pageViews).toBe(0);
    expect(m.clickThroughRate).toBe(0);
    expect(m.conversionRate).toBe(0);
  });

  it("avoids division by zero when no page views", () => {
    const m = computeHubMetrics([
      rollup({ event: "link_click", event_count: 5, unique_visitors: 3 }),
    ]);
    expect(m.clickThroughRate).toBe(0);
  });

  it("avoids division by zero when no unique visitors", () => {
    const m = computeHubMetrics([
      rollup({
        event: "booking_submitted",
        event_count: 1,
        unique_visitors: 0,
      }),
    ]);
    expect(m.conversionRate).toBe(0);
  });

  it("sums across multiple days", () => {
    const rollups = [
      rollup({
        roll_date: "2026-07-01",
        event: "page_view",
        event_count: 50,
        unique_visitors: 40,
      }),
      rollup({
        roll_date: "2026-07-02",
        event: "page_view",
        event_count: 30,
        unique_visitors: 25,
      }),
    ];
    const m = computeHubMetrics(rollups);
    expect(m.pageViews).toBe(80);
    expect(m.uniqueVisitors).toBe(65);
  });
});

describe("computeDailyMetrics", () => {
  it("groups by date and sorts chronologically", () => {
    const rollups = [
      rollup({
        roll_date: "2026-07-02",
        event: "page_view",
        event_count: 10,
        unique_visitors: 8,
      }),
      rollup({
        roll_date: "2026-07-01",
        event: "page_view",
        event_count: 20,
        unique_visitors: 15,
      }),
      rollup({
        roll_date: "2026-07-01",
        event: "link_click",
        event_count: 5,
        unique_visitors: 4,
      }),
    ];

    const daily = computeDailyMetrics(rollups);
    expect(daily).toHaveLength(2);
    expect(daily[0].date).toBe("2026-07-01");
    expect(daily[0].pageViews).toBe(20);
    expect(daily[0].linkClicks).toBe(5);
    expect(daily[1].date).toBe("2026-07-02");
    expect(daily[1].pageViews).toBe(10);
    expect(daily[1].linkClicks).toBe(0);
  });

  it("returns empty for no rollups", () => {
    expect(computeDailyMetrics([])).toEqual([]);
  });

  it("ignores non-view non-click events in daily breakdown", () => {
    const daily = computeDailyMetrics([
      rollup({
        event: "booking_submitted",
        event_count: 3,
        unique_visitors: 0,
      }),
    ]);
    expect(daily).toHaveLength(1);
    expect(daily[0].pageViews).toBe(0);
    expect(daily[0].linkClicks).toBe(0);
  });
});

describe("computeTopLinks", () => {
  it("ranks link clicks by total clicks descending", () => {
    const rollups = [
      rollup({
        event: "link_click",
        target_key: "instagram",
        event_count: 50,
        unique_visitors: 30,
      }),
      rollup({
        event: "link_click",
        target_key: "tiktok",
        event_count: 80,
        unique_visitors: 60,
      }),
      rollup({
        event: "link_click",
        target_key: "website",
        event_count: 10,
        unique_visitors: 8,
      }),
    ];

    const top = computeTopLinks(rollups);
    expect(top).toHaveLength(3);
    expect(top[0].targetKey).toBe("tiktok");
    expect(top[0].clicks).toBe(80);
    expect(top[1].targetKey).toBe("instagram");
    expect(top[2].targetKey).toBe("website");
  });

  it("ignores non-link_click events", () => {
    const top = computeTopLinks([
      rollup({ event: "page_view", target_key: "home" }),
      rollup({ event: "block_click", target_key: "booking_cta" }),
    ]);
    expect(top).toHaveLength(0);
  });

  it("ignores link clicks without target_key", () => {
    const top = computeTopLinks([
      rollup({ event: "link_click", target_key: null, event_count: 10 }),
    ]);
    expect(top).toHaveLength(0);
  });

  it("merges the same target across days", () => {
    const rollups = [
      rollup({
        roll_date: "2026-07-01",
        event: "link_click",
        target_key: "ig",
        event_count: 10,
        unique_visitors: 8,
      }),
      rollup({
        roll_date: "2026-07-02",
        event: "link_click",
        target_key: "ig",
        event_count: 15,
        unique_visitors: 12,
      }),
    ];
    const top = computeTopLinks(rollups);
    expect(top).toHaveLength(1);
    expect(top[0].clicks).toBe(25);
    expect(top[0].uniqueClickers).toBe(20);
  });

  it("caps at 20 links", () => {
    const rollups = Array.from({ length: 25 }, (_, i) =>
      rollup({
        event: "link_click",
        target_key: `link-${i}`,
        event_count: 25 - i,
        unique_visitors: 1,
      }),
    );
    const top = computeTopLinks(rollups);
    expect(top).toHaveLength(20);
    expect(top[0].targetKey).toBe("link-0");
  });
});

describe("hubAnalyticsCutoffIso", () => {
  const fixedNow = new Date("2026-07-30T12:00:00Z").getTime();

  it("returns 30-day cutoff", () => {
    const cut = hubAnalyticsCutoffIso("30", fixedNow);
    expect(cut).not.toBeNull();
    expect(new Date(cut!).toISOString().slice(0, 10)).toBe("2026-06-30");
  });

  it("returns 90-day cutoff", () => {
    const cut = hubAnalyticsCutoffIso("90", fixedNow);
    expect(cut).not.toBeNull();
    expect(new Date(cut!).toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("returns 365-day cutoff", () => {
    const cut = hubAnalyticsCutoffIso("365", fixedNow);
    expect(cut).not.toBeNull();
    expect(new Date(cut!).toISOString().slice(0, 10)).toBe("2025-07-30");
  });

  it("returns null for 'all'", () => {
    expect(hubAnalyticsCutoffIso("all", fixedNow)).toBeNull();
  });
});

describe("formatCentsEur", () => {
  it("formats positive cents", () => {
    expect(formatCentsEur(1500)).toBe("€15.00");
    expect(formatCentsEur(99)).toBe("€0.99");
    expect(formatCentsEur(300)).toBe("€3.00");
  });

  it("formats zero", () => {
    expect(formatCentsEur(0)).toBe("€0.00");
  });

  it("formats negative cents with a minus sign", () => {
    expect(formatCentsEur(-500)).toBe("-€5.00");
  });
});
