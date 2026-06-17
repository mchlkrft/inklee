import { describe, it, expect } from "vitest";
import {
  nextPositions,
  resolvePrimaryDayOnDetach,
  FLASH_FOLDER_SNAPSHOT_STATUSES,
} from "../server/flash-day-membership";

describe("nextPositions", () => {
  it("appends after the current max (empty day = max -1 -> starts at 0)", () => {
    expect(nextPositions(-1, 3)).toEqual([0, 1, 2]);
  });
  it("continues from a populated day", () => {
    expect(nextPositions(4, 2)).toEqual([5, 6]);
  });
  it("returns nothing for a zero count", () => {
    expect(nextPositions(2, 0)).toEqual([]);
  });
});

describe("resolvePrimaryDayOnDetach", () => {
  it("keeps the primary when a non-primary day is detached", () => {
    expect(resolvePrimaryDayOnDetach("day-a", "day-b", ["day-a"])).toBe(
      "day-a",
    );
  });
  it("repoints to a remaining day when the primary is detached", () => {
    expect(
      resolvePrimaryDayOnDetach("day-a", "day-a", ["day-b", "day-c"]),
    ).toBe("day-b");
  });
  it("clears the primary when no day remains", () => {
    expect(resolvePrimaryDayOnDetach("day-a", "day-a", [])).toBeNull();
  });
  it("leaves a null primary null", () => {
    expect(resolvePrimaryDayOnDetach(null, "day-a", ["day-b"])).toBeNull();
  });
});

describe("FLASH_FOLDER_SNAPSHOT_STATUSES", () => {
  it("snapshots published + draft, never archived", () => {
    expect([...FLASH_FOLDER_SNAPSHOT_STATUSES]).toEqual(["published", "draft"]);
    expect(FLASH_FOLDER_SNAPSHOT_STATUSES).not.toContain("archived");
  });
});
