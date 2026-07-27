import { describe, it, expect, afterEach } from "vitest";

import { isTrackablePath } from "@/lib/public-analytics/collector";
import {
  PUBLIC_EVENTS,
  validatePublicEvent,
} from "@/lib/public-analytics/event-registry";
import { GROWTH_EVENT_SCHEMAS } from "@/lib/growth/event-catalogue";

/**
 * Go-live plan S4 gates. Two failure modes are pinned here:
 *
 * 1. The map staying invisible in acquisition (its `/map` exclusion is the
 *    reason the public shell would otherwise report nothing), and the reverse
 *    failure of tracking authed artist behaviour into the public collector
 *    after a rollback.
 * 2. A map event carrying identifying data. The registry's allowlist is the
 *    enforcement; these tests prove it rejects ids, names, and free text.
 */

const ORIGINAL_TATTOO = process.env.NEXT_PUBLIC_TATTOO_MAP;
const ORIGINAL_PUBLIC = process.env.NEXT_PUBLIC_PUBLIC_MAP;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
function flags(tattoo: string | undefined, publicMap: string | undefined) {
  setEnv("NEXT_PUBLIC_TATTOO_MAP", tattoo);
  setEnv("NEXT_PUBLIC_PUBLIC_MAP", publicMap);
}

afterEach(() => {
  setEnv("NEXT_PUBLIC_TATTOO_MAP", ORIGINAL_TATTOO);
  setEnv("NEXT_PUBLIC_PUBLIC_MAP", ORIGINAL_PUBLIC);
});

describe("isTrackablePath: the /map carve-out follows the flip", () => {
  it("keeps /map private while the public map is dark", () => {
    flags("true", undefined);
    expect(isTrackablePath("/map")).toBe(false);
    expect(isTrackablePath("/map/loc-1")).toBe(false);
  });

  it("tracks the public map once it is live", () => {
    flags("true", "true");
    expect(isTrackablePath("/map")).toBe(true);
    expect(isTrackablePath("/map/loc-1")).toBe(true);
  });

  it("never tracks the authed guest-spot request route, in either state", () => {
    flags("true", "true");
    expect(isTrackablePath("/map/loc-1/request")).toBe(false);
    expect(isTrackablePath("/map/loc-1/request/")).toBe(false);
    flags("true", undefined);
    expect(isTrackablePath("/map/loc-1/request")).toBe(false);
  });

  it("leaves every other private prefix alone", () => {
    flags("true", "true");
    expect(isTrackablePath("/dashboard")).toBe(false);
    expect(isTrackablePath("/settings/map")).toBe(false);
    expect(isTrackablePath("/bookings/requests")).toBe(false);
    expect(isTrackablePath("/studios/black-needle")).toBe(true);
    expect(isTrackablePath("/")).toBe(true);
  });
});

describe("map events carry no identifying data", () => {
  it("registers the four map events with closed enum props", () => {
    for (const name of [
      "map_studio_opened",
      "map_filter_applied",
      "map_signup_cta_clicked",
      "studio_claim_started",
    ] as const) {
      expect(PUBLIC_EVENTS[name]).toBeDefined();
      for (const allowed of Object.values(PUBLIC_EVENTS[name].properties)) {
        // Never "*" (free text): every map prop is a closed vocabulary.
        expect(Array.isArray(allowed)).toBe(true);
      }
    }
  });

  it("accepts the allowlisted values", () => {
    expect(
      validatePublicEvent("map_studio_opened", { surface: "panel" }),
    ).not.toBeNull();
    expect(
      validatePublicEvent("map_filter_applied", { filter_type: "category" }),
    ).not.toBeNull();
    expect(
      validatePublicEvent("map_signup_cta_clicked", {
        surface: "studio_page",
        intent: "claim",
      }),
    ).not.toBeNull();
    expect(validatePublicEvent("studio_claim_started", {})).not.toBeNull();
  });

  it("rejects a studio id, name, or any unlisted property", () => {
    expect(
      validatePublicEvent("map_studio_opened", {
        surface: "panel",
        studio_id: "loc-1",
      }),
    ).toBeNull();
    expect(
      validatePublicEvent("map_studio_opened", { surface: "Black Needle" }),
    ).toBeNull();
    expect(
      validatePublicEvent("map_filter_applied", { filter_type: "blackwork" }),
    ).toBeNull();
    expect(
      validatePublicEvent("studio_claim_started", { city: "Berlin" }),
    ).toBeNull();
  });

  it("keeps the map events off the conversion set (account creation stays the conversion)", () => {
    for (const name of [
      "map_studio_opened",
      "map_filter_applied",
      "map_signup_cta_clicked",
      "studio_claim_started",
    ] as const) {
      expect(PUBLIC_EVENTS[name].isConversion).toBe(false);
    }
  });
});

describe("the authenticated claim milestone", () => {
  it("is catalogued and carries no location dimension", () => {
    const schema = GROWTH_EVENT_SCHEMAS.studio_claim_submitted;
    expect(schema).toBeDefined();
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ locationId: "loc-1" }).success).toBe(false);
  });
});
