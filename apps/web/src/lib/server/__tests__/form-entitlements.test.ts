import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CustomFieldDef } from "@/lib/custom-fields";

// The booking-form BEHAVIOUR entitlement boundary (Plus build P3). Two
// guarantees matter here and both are about not losing the artist's work:
// a downgrade shows every question rather than hiding some, and a stored
// condition survives both a downgrade and an unrelated edit.

const getAccountOverrides = vi.fn();
const conditionalQuestionsAllowed = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  conditionalQuestionsAllowed: (...a: unknown[]) =>
    conditionalQuestionsAllowed(...a),
}));

import {
  applyConditionEntitlement,
  conditionWriteAllowed,
} from "@/lib/server/form-entitlements";

const field = (over: Partial<CustomFieldDef> = {}): CustomFieldDef => ({
  id: "f1",
  artist_id: "a1",
  key: "notes",
  label: "Notes",
  type: "short_text",
  required: false,
  placeholder: null,
  help_text: null,
  options: [],
  active: true,
  position: 1,
  condition: null,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const COND = {
  fieldKey: "style",
  operator: "equals" as const,
  value: "colour",
};

beforeEach(() => {
  vi.clearAllMocks();
  getAccountOverrides.mockResolvedValue({});
});

describe("applyConditionEntitlement", () => {
  it("spends no entitlement read when no field has a condition", async () => {
    const fields = [field(), field({ id: "f2", key: "other" })];
    const out = await applyConditionEntitlement("a1", fields);
    expect(out).toBe(fields);
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });

  it("entitled: conditions pass through untouched", async () => {
    conditionalQuestionsAllowed.mockReturnValue(true);
    const fields = [field({ condition: COND })];
    const out = await applyConditionEntitlement("a1", fields);
    expect(out[0].condition).toEqual(COND);
  });

  it("un-entitled: conditions are stripped so every question SHOWS", async () => {
    conditionalQuestionsAllowed.mockReturnValue(false);
    const out = await applyConditionEntitlement("a1", [
      field({ condition: COND }),
    ]);
    expect(out[0].condition).toBeNull();
  });

  it("does not mutate the caller's fields, so the stored value is intact", async () => {
    conditionalQuestionsAllowed.mockReturnValue(false);
    const original = field({ condition: COND });
    await applyConditionEntitlement("a1", [original]);
    expect(original.condition).toEqual(COND);
  });

  it("fails SAFE to stripped when the plan read throws", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const out = await applyConditionEntitlement("a1", [
      field({ condition: COND }),
    ]);
    expect(out[0].condition).toBeNull();
  });
});

describe("conditionWriteAllowed", () => {
  it("always allows clearing a condition", async () => {
    conditionalQuestionsAllowed.mockReturnValue(false);
    expect(await conditionWriteAllowed("a1", null, COND)).toBe(true);
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });

  it("allows an UNCHANGED condition to ride along on an unrelated edit", async () => {
    conditionalQuestionsAllowed.mockReturnValue(false);
    expect(await conditionWriteAllowed("a1", COND, { ...COND })).toBe(true);
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });

  it("refuses a NEW condition when un-entitled", async () => {
    conditionalQuestionsAllowed.mockReturnValue(false);
    expect(await conditionWriteAllowed("a1", COND, null)).toBe(false);
  });

  it("refuses a CHANGED condition when un-entitled", async () => {
    conditionalQuestionsAllowed.mockReturnValue(false);
    const changed = { ...COND, value: "blackwork" };
    expect(await conditionWriteAllowed("a1", changed, COND)).toBe(false);
  });

  it("allows a new condition when entitled", async () => {
    conditionalQuestionsAllowed.mockReturnValue(true);
    expect(await conditionWriteAllowed("a1", COND, null)).toBe(true);
  });

  it("refuses on a plan-read blip, unlike the render path", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    expect(await conditionWriteAllowed("a1", COND, null)).toBe(false);
  });
});
