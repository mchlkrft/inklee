// The email preference semantics every lifecycle and campaign send gates on: absent prefs
// mean opted in, an explicit false opts out per category, and transactional mail can never
// be opted out of (it is exempt by design, only hard suppression stops it).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ serviceClient: {} }));

import { isOptedOut } from "@/lib/email-campaigns/preferences";

describe("isOptedOut", () => {
  it("treats absent prefs as opted in", () => {
    expect(isOptedOut({}, "lifecycle")).toBe(false);
    expect(isOptedOut({}, "marketing")).toBe(false);
    expect(isOptedOut({ email_prefs: {} }, "lifecycle")).toBe(false);
  });

  it("an explicit false opts out of exactly that category", () => {
    const settings = { email_prefs: { lifecycle: false, marketing: true } };
    expect(isOptedOut(settings, "lifecycle")).toBe(true);
    expect(isOptedOut(settings, "marketing")).toBe(false);
  });

  it("transactional is exempt from opt-out", () => {
    const settings = { email_prefs: { lifecycle: false, marketing: false } };
    expect(isOptedOut(settings, "transactional")).toBe(false);
  });
});
