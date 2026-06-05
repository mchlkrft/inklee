import { describe, it, expect } from "vitest";
import { parseFormSettings, DEFAULT_FORM_SETTINGS } from "../form-settings";

describe("parseFormSettings", () => {
  it("returns defaults for empty/invalid input", () => {
    expect(parseFormSettings(undefined)).toEqual(DEFAULT_FORM_SETTINGS);
    expect(parseFormSettings(null)).toEqual(DEFAULT_FORM_SETTINGS);
    expect(parseFormSettings("nope")).toEqual(DEFAULT_FORM_SETTINGS);
  });

  it("always forces email + preferred date shown (email is mandatory)", () => {
    const s = parseFormSettings({
      show_email: false,
      show_preferred_date: false,
    });
    expect(s.show_email).toBe(true);
    expect(s.show_preferred_date).toBe(true);
  });

  it("defaults: placement/size/description required, contact+extras optional", () => {
    const s = parseFormSettings({});
    expect(s.require_placement).toBe(true);
    expect(s.require_size).toBe(true);
    expect(s.require_description).toBe(true);
    expect(s.require_instagram_handle).toBe(false);
    expect(s.require_reference_link).toBe(false);
    expect(s.require_image_upload).toBe(false);
  });

  it("respects stored required + visibility flags", () => {
    const s = parseFormSettings({
      require_instagram_handle: true,
      require_placement: false,
      show_size: false,
      require_reference_link: true,
    });
    expect(s.require_instagram_handle).toBe(true);
    expect(s.require_placement).toBe(false);
    expect(s.show_size).toBe(false);
    expect(s.require_reference_link).toBe(true);
  });
});
