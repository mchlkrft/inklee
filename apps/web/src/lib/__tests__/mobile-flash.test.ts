import { describe, it, expect } from "vitest";
import {
  normalizeFlashDayInput,
  normalizeFlashItemUpdate,
} from "../mobile-flash";

const UUID = "11111111-1111-4111-8111-111111111111";

const baseItem = {
  title: "Dragon",
  status: "published",
  priceType: "from",
  price: 120,
  bookingMode: "unique",
  isBookable: true,
};

describe("normalizeFlashItemUpdate", () => {
  it("accepts a valid payload and normalizes optional fields", () => {
    const r = normalizeFlashItemUpdate({
      ...baseItem,
      shortDescription: "  neo-trad  ",
      sizeInfo: "  ~10cm ",
      placementNotes: "",
      availableFrom: "2026-07-01",
      availableUntil: "",
      flashDayId: `  ${UUID} `,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.price).toBe(120);
      expect(r.value.shortDescription).toBe("neo-trad");
      expect(r.value.placementNotes).toBeNull();
      expect(r.value.availableFrom).toBe("2026-07-01");
      expect(r.value.availableUntil).toBeNull();
      expect(r.value.flashDayId).toBe(UUID);
    }
  });

  it("rejects a non-UUID flash day, an unreal date, and until-before-from", () => {
    expect(
      normalizeFlashItemUpdate({ ...baseItem, flashDayId: "day-1" }).ok,
    ).toBe(false);
    expect(
      normalizeFlashItemUpdate({ ...baseItem, availableFrom: "2026-13-45" }).ok,
    ).toBe(false);
    expect(
      normalizeFlashItemUpdate({
        ...baseItem,
        availableFrom: "2026-08-01",
        availableUntil: "2026-07-01",
      }).ok,
    ).toBe(false);
  });

  it("clears price for the 'request' price type", () => {
    const r = normalizeFlashItemUpdate({
      ...baseItem,
      priceType: "request",
      price: 99,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.price).toBeNull();
  });

  it("requires a positive integer maxBookings for limited mode", () => {
    expect(
      normalizeFlashItemUpdate({ ...baseItem, bookingMode: "limited" }).ok,
    ).toBe(false);
    const ok = normalizeFlashItemUpdate({
      ...baseItem,
      bookingMode: "limited",
      maxBookings: 3,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.maxBookings).toBe(3);
    // maxBookings is ignored (null) for non-limited modes
    const uniq = normalizeFlashItemUpdate({ ...baseItem, maxBookings: 5 });
    expect(uniq.ok).toBe(true);
    if (uniq.ok) expect(uniq.value.maxBookings).toBeNull();
  });

  it("rejects a missing title, bad enums, and a malformed date", () => {
    expect(normalizeFlashItemUpdate({ ...baseItem, title: "  " }).ok).toBe(
      false,
    );
    expect(normalizeFlashItemUpdate({ ...baseItem, status: "live" }).ok).toBe(
      false,
    );
    expect(
      normalizeFlashItemUpdate({ ...baseItem, priceType: "auction" }).ok,
    ).toBe(false);
    expect(
      normalizeFlashItemUpdate({ ...baseItem, bookingMode: "many" }).ok,
    ).toBe(false);
    expect(
      normalizeFlashItemUpdate({ ...baseItem, availableFrom: "07-2026" }).ok,
    ).toBe(false);
    expect(
      normalizeFlashItemUpdate({ ...baseItem, isBookable: "yes" }).ok,
    ).toBe(false);
  });
});

describe("normalizeFlashDayInput", () => {
  it("accepts a valid payload and defaults status to upcoming", () => {
    const r = normalizeFlashDayInput({
      title: "  Walk-in day  ",
      scheduledOn: "2026-08-15",
      location: "  Studio X ",
      isPublic: true,
    });
    expect(r).toEqual({
      ok: true,
      value: {
        title: "Walk-in day",
        scheduledOn: "2026-08-15",
        location: "Studio X",
        description: null,
        status: "upcoming",
        isPublic: true,
      },
    });
  });

  it("rejects a missing title, a bad status, and a malformed date", () => {
    expect(normalizeFlashDayInput({ title: "" }).ok).toBe(false);
    expect(normalizeFlashDayInput({ title: "X", status: "soon" }).ok).toBe(
      false,
    );
    expect(
      normalizeFlashDayInput({ title: "X", scheduledOn: "tomorrow" }).ok,
    ).toBe(false);
  });

  it("defaults isPublic to false when omitted", () => {
    const r = normalizeFlashDayInput({ title: "X" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.isPublic).toBe(false);
  });
});
