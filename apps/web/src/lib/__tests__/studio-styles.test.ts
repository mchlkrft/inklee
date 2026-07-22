import { describe, expect, it } from "vitest";
import { aggregateStudioStyles } from "@inklee/shared/studio-styles";

// The spec's studio-style scenarios. Resident coverage is intentionally absent
// (no roster), so "resident artist" cases are modelled as declared specialties
// or guest coverage, whichever is honest.

describe("aggregateStudioStyles", () => {
  it("one declared specialty, no guests", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: ["blackwork"],
      guestArtistStyleKeys: [],
    });
    expect(r.specialties).toEqual(["blackwork"]);
    expect(r.guestStyles).toEqual([]);
    expect(r.isEmpty).toBe(false);
  });

  it("declared specialty without any linked artist data", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: ["japanese", "fine_line"],
      guestArtistStyleKeys: [],
    });
    expect(r.specialties).toEqual(["japanese", "fine_line"]);
    expect(r.guestStyles).toEqual([]);
  });

  it("studio with no declared styles and no linked artists is empty", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: [],
      guestArtistStyleKeys: [],
    });
    expect(r.isEmpty).toBe(true);
    expect(r.specialties).toEqual([]);
    expect(r.guestStyles).toEqual([]);
  });

  it("seeded listing (no styles) renders nothing", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: [],
      guestArtistStyleKeys: [],
      floor: 3,
    });
    expect(r.isEmpty).toBe(true);
  });

  it("dedupes repeated declared specialties, preserving first-seen order", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: ["realism", "blackwork", "realism"],
      guestArtistStyleKeys: [],
    });
    expect(r.specialties).toEqual(["realism", "blackwork"]);
  });

  it("multiple guest artists with overlapping styles aggregate by count", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: [],
      guestArtistStyleKeys: [
        ["blackwork", "realism"],
        ["blackwork"],
        ["blackwork", "fine_line"],
      ],
      floor: 3,
    });
    // blackwork on 3 guests (>= floor → shown), realism + fine_line on 1 each.
    expect(r.guestStyles[0]).toEqual({
      styleKey: "blackwork",
      count: 3,
      showCount: true,
    });
    const realism = r.guestStyles.find((g) => g.styleKey === "realism");
    expect(realism).toEqual({
      styleKey: "realism",
      count: 1,
      showCount: false,
    });
  });

  it("multiple unrelated guest styles are unioned", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: [],
      guestArtistStyleKeys: [["japanese"], ["lettering"], ["dotwork"]],
      floor: 3,
    });
    expect(r.guestStyles.map((g) => g.styleKey).sort()).toEqual([
      "dotwork",
      "japanese",
      "lettering",
    ]);
    expect(r.guestStyles.every((g) => g.count === 1 && !g.showCount)).toBe(
      true,
    );
  });

  it("a guest listing a style twice counts once", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: [],
      guestArtistStyleKeys: [["blackwork", "blackwork"]],
    });
    expect(r.guestStyles).toEqual([
      { styleKey: "blackwork", count: 1, showCount: false },
    ]);
  });

  it("applies the anonymity floor to guest counts", () => {
    const twoGuests = aggregateStudioStyles({
      declaredStyleKeys: [],
      guestArtistStyleKeys: [["realism"], ["realism"]],
      floor: 3,
    });
    expect(twoGuests.guestStyles[0]).toMatchObject({
      count: 2,
      showCount: false,
    });
    const threeGuests = aggregateStudioStyles({
      declaredStyleKeys: [],
      guestArtistStyleKeys: [["realism"], ["realism"], ["realism"]],
      floor: 3,
    });
    expect(threeGuests.guestStyles[0]).toMatchObject({
      count: 3,
      showCount: true,
    });
  });

  it("a style can be both a declared specialty and a guest style", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: ["blackwork"],
      guestArtistStyleKeys: [["blackwork"], ["blackwork"], ["blackwork"]],
      floor: 3,
    });
    expect(r.specialties).toEqual(["blackwork"]);
    expect(r.guestStyles).toEqual([
      { styleKey: "blackwork", count: 3, showCount: true },
    ]);
  });

  it("sorts guest styles by count desc, then style key", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: [],
      guestArtistStyleKeys: [
        ["realism", "blackwork"],
        ["realism", "watercolor"],
        ["watercolor"],
      ],
      floor: 1,
    });
    // realism 2, watercolor 2, blackwork 1 → realism before watercolor (key),
    // both before blackwork (count).
    expect(r.guestStyles.map((g) => g.styleKey)).toEqual([
      "realism",
      "watercolor",
      "blackwork",
    ]);
  });

  it("ignores empty style keys defensively", () => {
    const r = aggregateStudioStyles({
      declaredStyleKeys: ["", "blackwork", ""],
      guestArtistStyleKeys: [["", "realism"], [""]],
    });
    expect(r.specialties).toEqual(["blackwork"]);
    expect(r.guestStyles).toEqual([
      { styleKey: "realism", count: 1, showCount: false },
    ]);
  });
});
