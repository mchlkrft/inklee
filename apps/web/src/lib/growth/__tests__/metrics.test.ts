import { describe, expect, it } from "vitest";
import {
  buildActivationFunnel,
  classifyStage,
  compare,
  deltaLabel,
  firstApprovalAt,
  groupByAttribution,
  hasBookingSignal,
  isActivated,
  isCountedArtist,
  median,
  medianDaysToActivation,
  medianDaysToFirstRequest,
  rate,
  sampleGuard,
} from "../metrics";
import { makeRow } from "./fixtures";

describe("isCountedArtist", () => {
  it("counts a real, active, non-deleted artist", () => {
    expect(isCountedArtist(makeRow())).toBe(true);
  });

  it("excludes testers", () => {
    expect(isCountedArtist(makeRow({ is_tester: true }))).toBe(false);
  });

  it("excludes suspended accounts", () => {
    expect(isCountedArtist(makeRow({ account_status: "suspended" }))).toBe(
      false,
    );
  });

  it("excludes any non-active account status", () => {
    expect(isCountedArtist(makeRow({ account_status: "deleted" }))).toBe(false);
  });

  it("excludes soft-deleted rows", () => {
    expect(isCountedArtist(makeRow({ soft_deleted: true }))).toBe(false);
  });
});

describe("hasBookingSignal", () => {
  it("is false with no booking-related activity at all", () => {
    expect(hasBookingSignal(makeRow())).toBe(false);
  });

  it("fires on received requests", () => {
    expect(hasBookingSignal(makeRow({ total_requests: 1 }))).toBe(true);
  });

  it("fires on approved requests", () => {
    expect(hasBookingSignal(makeRow({ approved_requests: 1 }))).toBe(true);
  });

  it("fires on created slots", () => {
    expect(hasBookingSignal(makeRow({ slot_count: 1 }))).toBe(true);
  });

  it("fires on books configured AND open, but not on either alone", () => {
    expect(
      hasBookingSignal(
        makeRow({ books_configured: true, books_open_flag: true }),
      ),
    ).toBe(true);
    expect(hasBookingSignal(makeRow({ books_configured: true }))).toBe(false);
    expect(hasBookingSignal(makeRow({ books_open_flag: true }))).toBe(false);
  });

  it("fires on published trips, not drafts", () => {
    expect(hasBookingSignal(makeRow({ published_trip_count: 1 }))).toBe(true);
    expect(hasBookingSignal(makeRow({ trip_count: 3 }))).toBe(false);
  });

  it("fires on published flash, not drafts", () => {
    expect(hasBookingSignal(makeRow({ published_flash_count: 1 }))).toBe(true);
    expect(hasBookingSignal(makeRow({ flash_count: 3 }))).toBe(false);
  });
});

describe("isActivated", () => {
  it("requires onboarding, a live page, and a booking signal together", () => {
    expect(
      isActivated(makeRow({ onboarding_completed: true, slot_count: 1 })),
    ).toBe(true);
  });

  it("is false without the onboarding flag even with strong signals", () => {
    expect(
      isActivated(makeRow({ total_requests: 5, approved_requests: 2 })),
    ).toBe(false);
  });

  it("is false with onboarding done but no booking signal", () => {
    expect(isActivated(makeRow({ onboarding_completed: true }))).toBe(false);
  });

  it("suspension unpublishes the page and de-activates the artist", () => {
    expect(
      isActivated(
        makeRow({
          onboarding_completed: true,
          slot_count: 1,
          account_status: "suspended",
        }),
      ),
    ).toBe(false);
  });

  it("soft deletion also unpublishes the page", () => {
    expect(
      isActivated(
        makeRow({
          onboarding_completed: true,
          slot_count: 1,
          soft_deleted: true,
        }),
      ),
    ).toBe(false);
  });

  it("an empty slug means no page, so no activation", () => {
    expect(
      isActivated(
        makeRow({ onboarding_completed: true, slot_count: 1, slug: "" }),
      ),
    ).toBe(false);
  });
});

describe("classifyStage", () => {
  it("puts incomplete onboarding first, even with requests already in", () => {
    expect(classifyStage(makeRow())).toBe("claimed_not_completed");
    expect(classifyStage(makeRow({ total_requests: 5 }))).toBe(
      "claimed_not_completed",
    );
  });

  it("completed but no requests and no activation signal", () => {
    expect(classifyStage(makeRow({ onboarding_completed: true }))).toBe(
      "completed_no_requests",
    );
  });

  it("activated without any requests skips completed_no_requests", () => {
    expect(
      classifyStage(makeRow({ onboarding_completed: true, slot_count: 1 })),
    ).toBe("activated");
  });

  it("requests without an approval classify as requests_no_approval", () => {
    expect(
      classifyStage(makeRow({ onboarding_completed: true, total_requests: 2 })),
    ).toBe("requests_no_approval");
  });

  it("requests plus an approval classify as activated", () => {
    expect(
      classifyStage(
        makeRow({
          onboarding_completed: true,
          total_requests: 2,
          approved_requests: 1,
          first_approved_at: "2026-06-20T00:00:00Z",
        }),
      ),
    ).toBe("activated");
  });
});

describe("firstApprovalAt", () => {
  it("prefers the audit-derived timestamp", () => {
    const row = makeRow({
      first_approved_at: "2026-06-01T00:00:00Z",
      approved_requests: 1,
      last_decision_at: "2026-06-05T00:00:00Z",
    });
    expect(firstApprovalAt(row)).toBe("2026-06-01T00:00:00Z");
  });

  it("falls back to last_decision_at for decided-era rows", () => {
    const row = makeRow({
      approved_requests: 1,
      last_decision_at: "2026-05-10T00:00:00Z",
      last_request_at: "2026-05-08T00:00:00Z",
    });
    expect(firstApprovalAt(row)).toBe("2026-05-10T00:00:00Z");
  });

  it("falls back further to last_request_at when no decision timestamp exists", () => {
    const row = makeRow({
      approved_requests: 1,
      last_request_at: "2026-05-08T00:00:00Z",
    });
    expect(firstApprovalAt(row)).toBe("2026-05-08T00:00:00Z");
  });

  it("is null with approvals but no timestamps at all", () => {
    expect(firstApprovalAt(makeRow({ approved_requests: 1 }))).toBeNull();
  });

  it("is null with zero approvals, even if decision timestamps exist", () => {
    expect(
      firstApprovalAt(
        makeRow({
          last_decision_at: "2026-05-10T00:00:00Z",
          rejected_requests: 1,
        }),
      ),
    ).toBeNull();
  });
});

describe("buildActivationFunnel", () => {
  const claimed = "2026-06-15T10:00:00Z";
  const rows = [
    // Claimed, onboarding not done.
    makeRow({ id: "r1", profile_claimed_at: claimed }),
    // Onboarding done, no signal.
    makeRow({
      id: "r2",
      profile_claimed_at: claimed,
      onboarding_completed: true,
    }),
    // A request but no approval (activated via the request signal).
    makeRow({
      id: "r3",
      profile_claimed_at: claimed,
      onboarding_completed: true,
      total_requests: 1,
    }),
    // Fully through the funnel.
    makeRow({
      id: "r4",
      profile_claimed_at: claimed,
      onboarding_completed: true,
      total_requests: 2,
      approved_requests: 1,
      first_approved_at: "2026-06-20T00:00:00Z",
    }),
    // Tester, must be invisible everywhere.
    makeRow({
      id: "r5",
      profile_claimed_at: claimed,
      is_tester: true,
      onboarding_completed: true,
      total_requests: 3,
    }),
  ];

  it("heads the funnel with auth signups and computes pctOfTop against it", () => {
    expect(buildActivationFunnel(rows, 8)).toEqual([
      { key: "account", label: "Account created", count: 8, pctOfTop: 100 },
      { key: "claimed", label: "Booking page claimed", count: 4, pctOfTop: 50 },
      {
        key: "completed",
        label: "Onboarding completed",
        count: 3,
        pctOfTop: 38,
      },
      { key: "published", label: "Page live", count: 4, pctOfTop: 50 },
      { key: "activated", label: "Activated", count: 2, pctOfTop: 25 },
      {
        key: "first_request",
        label: "First request received",
        count: 2,
        pctOfTop: 25,
      },
      {
        key: "first_approval",
        label: "First request approved",
        count: 1,
        pctOfTop: 13,
      },
    ]);
  });

  it("omits the account stage and heads with claimed when auth count is unknown", () => {
    const stages = buildActivationFunnel(rows, null);
    expect(stages.map((stage) => stage.key)).toEqual([
      "claimed",
      "completed",
      "published",
      "activated",
      "first_request",
      "first_approval",
    ]);
    expect(stages[0]).toMatchObject({ count: 4, pctOfTop: 100 });
    expect(stages[1]).toMatchObject({ count: 3, pctOfTop: 75 });
  });

  it("filters cohorts by ACCOUNT CREATION date with half-open [from, to) bounds", () => {
    // Cohort membership follows account creation (matching the auth head);
    // claim-date filtering would let pre-window accounts that claim inside
    // the window push stages past 100% of the head.
    const range = {
      from: new Date("2026-06-01T00:00:00Z"),
      to: new Date("2026-07-01T00:00:00Z"),
    };
    const boundaryRows = [
      makeRow({ id: "in1", account_created_at: "2026-06-01T00:00:00Z" }),
      makeRow({ id: "in2", account_created_at: "2026-06-30T23:59:59Z" }),
      makeRow({ id: "out1", account_created_at: "2026-05-31T23:59:59Z" }),
      makeRow({ id: "out2", account_created_at: "2026-07-01T00:00:00Z" }),
      // No auth row recorded: falls back to the claim date.
      makeRow({
        id: "in3",
        account_created_at: null,
        profile_claimed_at: "2026-06-15T00:00:00Z",
      }),
    ];
    const stages = buildActivationFunnel(boundaryRows, null, range);
    expect(stages[0]).toMatchObject({
      key: "claimed",
      count: 3,
      pctOfTop: 100,
    });
  });

  it("renders an empty funnel with null percentages, not fake zeros", () => {
    const stages = buildActivationFunnel([], null);
    expect(stages).toHaveLength(6);
    for (const stage of stages) {
      expect(stage.count).toBe(0);
      expect(stage.pctOfTop).toBeNull();
    }
  });
});

describe("compare", () => {
  it("computes the rounded percentage delta", () => {
    expect(compare(12, 10)).toEqual({
      current: 12,
      previous: 10,
      deltaPct: 20,
    });
    expect(compare(5, 10)).toEqual({ current: 5, previous: 10, deltaPct: -50 });
    expect(compare(0, 10)).toEqual({
      current: 0,
      previous: 10,
      deltaPct: -100,
    });
    expect(compare(7, 3).deltaPct).toBe(133);
  });

  it("returns a null delta when the previous period is unknown", () => {
    expect(compare(5, null)).toEqual({
      current: 5,
      previous: null,
      deltaPct: null,
    });
  });

  it("returns a null delta when the previous period is zero", () => {
    expect(compare(5, 0)).toEqual({ current: 5, previous: 0, deltaPct: null });
  });
});

describe("deltaLabel", () => {
  it("signs positive and zero deltas explicitly", () => {
    expect(deltaLabel({ current: 12, previous: 10, deltaPct: 20 })).toBe(
      "+20%",
    );
    expect(deltaLabel({ current: 10, previous: 10, deltaPct: 0 })).toBe("+0%");
  });

  it("keeps the negative sign", () => {
    expect(deltaLabel({ current: 5, previous: 10, deltaPct: -50 })).toBe(
      "-50%",
    );
  });

  it("is null when there is no delta", () => {
    expect(
      deltaLabel({ current: 5, previous: null, deltaPct: null }),
    ).toBeNull();
  });
});

describe("median", () => {
  it("is null for an empty list", () => {
    expect(median([])).toBeNull();
  });

  it("returns the middle value for odd-length input", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([5])).toBe(5);
  });

  it("averages the two middle values for even-length input", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("does not mutate the input array", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("medianDaysToFirstRequest", () => {
  it("takes the median of claim-to-first-request durations", () => {
    const rows = [
      makeRow({
        id: "a",
        profile_claimed_at: "2026-05-01T00:00:00Z",
        first_request_at: "2026-05-03T00:00:00Z",
      }),
      makeRow({
        id: "b",
        profile_claimed_at: "2026-05-01T00:00:00Z",
        first_request_at: "2026-05-05T00:00:00Z",
      }),
    ];
    expect(medianDaysToFirstRequest(rows)).toBe(3);
  });

  it("ignores negative durations (request timestamped before the claim)", () => {
    const rows = [
      makeRow({
        id: "a",
        profile_claimed_at: "2026-05-01T00:00:00Z",
        first_request_at: "2026-05-03T00:00:00Z",
      }),
      makeRow({
        id: "b",
        profile_claimed_at: "2026-05-10T00:00:00Z",
        first_request_at: "2026-05-08T00:00:00Z",
      }),
    ];
    expect(medianDaysToFirstRequest(rows)).toBe(2);
  });

  it("is null when only negative durations exist", () => {
    const rows = [
      makeRow({
        profile_claimed_at: "2026-05-10T00:00:00Z",
        first_request_at: "2026-05-08T00:00:00Z",
      }),
    ];
    expect(medianDaysToFirstRequest(rows)).toBeNull();
  });

  it("is null when no counted artist has a first request", () => {
    expect(medianDaysToFirstRequest([makeRow()])).toBeNull();
  });

  it("rounds to one decimal", () => {
    const rows = [
      makeRow({
        profile_claimed_at: "2026-05-01T00:00:00Z",
        first_request_at: "2026-05-02T08:00:00Z", // 32 hours = 1.33 days
      }),
    ];
    expect(medianDaysToFirstRequest(rows)).toBe(1.3);
  });

  it("excludes testers from the sample", () => {
    const rows = [
      makeRow({
        id: "tester",
        is_tester: true,
        profile_claimed_at: "2026-05-01T00:00:00Z",
        first_request_at: "2026-05-02T00:00:00Z",
      }),
      makeRow({
        id: "real",
        profile_claimed_at: "2026-05-01T00:00:00Z",
        first_request_at: "2026-05-06T00:00:00Z",
      }),
    ];
    expect(medianDaysToFirstRequest(rows)).toBe(5);
  });
});

describe("medianDaysToActivation", () => {
  it("is null when no activation moment was ever recorded", () => {
    const rows = [makeRow({ onboarding_completed: true, slot_count: 1 })];
    expect(medianDaysToActivation(rows)).toBeNull();
  });

  it("measures account creation to the ACTIVATION moment (completion + booking signal)", () => {
    // Activation requires both onboarding completion and a booking signal;
    // the activation moment is the later of the two, not merely completion.
    const rows = [
      makeRow({
        onboarding_completed: true,
        slot_count: 1,
        first_slot_created_at: "2026-07-05T00:00:00Z",
        account_created_at: "2026-07-01T00:00:00Z",
        onboarding_completed_event_at: "2026-07-03T12:00:00Z",
      }),
    ];
    expect(medianDaysToActivation(rows)).toBe(4);
  });

  it("returns null when the booking signal carries no timestamp", () => {
    // Books-open-only activation has no recorded moment: honest null, not a
    // completion-time stand-in.
    const rows = [
      makeRow({
        onboarding_completed: true,
        books_configured: true,
        books_open_flag: true,
        account_created_at: "2026-07-01T00:00:00Z",
        onboarding_completed_event_at: "2026-07-03T12:00:00Z",
      }),
    ];
    expect(medianDaysToActivation(rows)).toBeNull();
  });
});

describe("sampleGuard", () => {
  it("passes at exactly the minimum sample", () => {
    expect(sampleGuard(10, 10)).toEqual({ ok: true, warning: null });
  });

  it("warns one below the minimum", () => {
    expect(sampleGuard(9, 10)).toEqual({
      ok: false,
      warning:
        "Based on 9 artists, below the minimum sample of 10. Treat as anecdote, not signal.",
    });
  });

  it("uses the singular for one artist", () => {
    expect(sampleGuard(1, 10).warning).toBe(
      "Based on 1 artist, below the minimum sample of 10. Treat as anecdote, not signal.",
    );
  });

  it("uses the plural for zero artists", () => {
    expect(sampleGuard(0, 10).warning).toContain("Based on 0 artists,");
  });
});

describe("rate", () => {
  it("is null for a zero or negative denominator", () => {
    expect(rate(5, 0)).toBeNull();
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, -1)).toBeNull();
  });

  it("rounds to whole percentages", () => {
    expect(rate(1, 3)).toBe(33);
    expect(rate(2, 3)).toBe(67);
    expect(rate(3, 3)).toBe(100);
    expect(rate(0, 10)).toBe(0);
  });
});

describe("groupByAttribution", () => {
  it("groups counted rows and maps null to unknown", () => {
    const rows = [
      makeRow({ id: "a", attribution_source: "instagram" }),
      makeRow({ id: "b", attribution_source: "instagram" }),
      makeRow({ id: "c", attribution_source: null }),
    ];
    const groups = groupByAttribution(rows, "attribution_source");
    expect(groups.size).toBe(2);
    expect(groups.get("instagram")?.map((row) => row.id)).toEqual(["a", "b"]);
    expect(groups.get("unknown")?.map((row) => row.id)).toEqual(["c"]);
  });

  it("drops testers before grouping", () => {
    const rows = [
      makeRow({ id: "t", is_tester: true, attribution_source: "instagram" }),
      makeRow({
        id: "s",
        account_status: "suspended",
        attribution_source: "instagram",
      }),
    ];
    expect(groupByAttribution(rows, "attribution_source").size).toBe(0);
  });
});
