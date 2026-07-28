import { describe, it, expect } from "vitest";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_META,
  PROJECT_TRANSITIONS,
  OPEN_PROJECT_STATUSES,
  canTransitionProject,
  isProjectStatus,
  projectIntakeSchema,
  validateBudgetRange,
  labelForKey,
  budgetRangeLabel,
  BODY_AREAS,
  PROJECT_MAX_BODY_AREAS,
  PROJECT_MAX_STYLES,
} from "@inklee/shared/projects";

const valid = {
  title: "Japanese back piece",
  description:
    "A full back piece, koi and waves, building toward a bodysuit later.",
  bodyAreas: ["back"],
  scale: "back_piece",
  customerEmail: "client@example.com",
};

describe("project lifecycle", () => {
  it("describes every status", () => {
    for (const s of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_META[s], s).toBeDefined();
      expect(PROJECT_STATUS_META[s].label).toBeTruthy();
    }
  });

  it("only lists real statuses as transition targets", () => {
    for (const [from, targets] of Object.entries(PROJECT_TRANSITIONS)) {
      expect(isProjectStatus(from)).toBe(true);
      for (const t of targets) {
        expect(isProjectStatus(t), `${from} -> ${t}`).toBe(true);
        expect(t, `${from} -> itself`).not.toBe(from);
      }
    }
  });

  it("never lets a declined project become active without archiving first", () => {
    expect(canTransitionProject("declined", "active")).toBe(false);
    expect(canTransitionProject("declined", "archived")).toBe(true);
  });

  it("lets a stalled project go back to consultation", () => {
    expect(canTransitionProject("active", "consultation")).toBe(true);
  });

  it("lets a completed project reopen, since work comes back", () => {
    expect(canTransitionProject("completed", "active")).toBe(true);
  });

  // Un-archiving lands in under_review rather than guessing the prior state,
  // which is not stored.
  it("un-archives to exactly one honest state", () => {
    expect(PROJECT_TRANSITIONS.archived).toEqual(["under_review"]);
  });

  it("treats every open status as non-terminal", () => {
    for (const s of OPEN_PROJECT_STATUSES) {
      expect(PROJECT_STATUS_META[s].terminal, s).toBe(false);
    }
  });

  it("rejects an unknown status", () => {
    expect(isProjectStatus("in_progress")).toBe(false);
    expect(canTransitionProject("submitted", "in_progress" as never)).toBe(
      false,
    );
  });
});

describe("projectIntakeSchema", () => {
  it("accepts a minimal valid intake", () => {
    const r = projectIntakeSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("requires a description long enough to be an enquiry", () => {
    const r = projectIntakeSchema.safeParse({ ...valid, description: "hi" });
    expect(r.success).toBe(false);
  });

  it("requires at least one body area", () => {
    const r = projectIntakeSchema.safeParse({ ...valid, bodyAreas: [] });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown body area rather than storing free text", () => {
    const r = projectIntakeSchema.safeParse({
      ...valid,
      bodyAreas: ["left_earlobe"],
    });
    expect(r.success).toBe(false);
  });

  it("caps the number of areas and styles", () => {
    const tooMany = BODY_AREAS.slice(0, PROJECT_MAX_BODY_AREAS + 1).map(
      (a) => a.key,
    );
    expect(
      projectIntakeSchema.safeParse({ ...valid, bodyAreas: tooMany }).success,
    ).toBe(false);
    expect(
      projectIntakeSchema.safeParse({
        ...valid,
        styles: Array(PROJECT_MAX_STYLES + 1).fill("blackwork"),
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown scale", () => {
    expect(
      projectIntakeSchema.safeParse({ ...valid, scale: "enormous" }).success,
    ).toBe(false);
  });

  it("requires a usable email", () => {
    expect(
      projectIntakeSchema.safeParse({ ...valid, customerEmail: "nope" })
        .success,
    ).toBe(false);
  });

  // Budget is optional by design: requiring it on a public intake turns an
  // enquiry into a negotiation before the artist has said anything.
  it("accepts an intake with no budget at all", () => {
    const r = projectIntakeSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.budgetMinCents).toBeUndefined();
      expect(r.data.budgetMaxCents).toBeUndefined();
    }
  });

  it("keeps optional prose out of the record when blank", () => {
    const r = projectIntakeSchema.safeParse({ ...valid, longTermGoal: "   " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.longTermGoal).toBeUndefined();
  });
});

describe("validateBudgetRange", () => {
  it("passes when either end is missing", () => {
    expect(validateBudgetRange(null, null)).toBeNull();
    expect(validateBudgetRange(50000, null)).toBeNull();
    expect(validateBudgetRange(null, 50000)).toBeNull();
  });
  it("passes an equal range", () => {
    expect(validateBudgetRange(50000, 50000)).toBeNull();
  });
  it("catches an inverted range", () => {
    expect(validateBudgetRange(80000, 50000)).toBeTruthy();
  });
});

describe("display helpers", () => {
  const eur = (c: number) => `€${(c / 100).toFixed(0)}`;

  it("labels a known key and falls back to the raw key", () => {
    expect(labelForKey(BODY_AREAS, "back")).toBe("Back");
    // A value stored before a vocabulary entry was removed still renders.
    expect(labelForKey(BODY_AREAS, "retired_area")).toBe("retired_area");
    expect(labelForKey(BODY_AREAS, null)).toBeNull();
  });

  it("phrases every budget shape", () => {
    expect(budgetRangeLabel(null, null, eur)).toBeNull();
    expect(budgetRangeLabel(50000, 80000, eur)).toBe("€500 to €800");
    expect(budgetRangeLabel(50000, null, eur)).toBe("From €500");
    expect(budgetRangeLabel(null, 80000, eur)).toBe("Up to €800");
  });

  it("keeps every status label free of em-dashes (founder copy rule)", () => {
    for (const s of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_META[s].label).not.toContain("—");
      expect(PROJECT_STATUS_META[s].description).not.toContain("—");
    }
  });
});
