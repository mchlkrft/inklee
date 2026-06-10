import { describe, it, expect } from "vitest";
import { isReauthFresh, REAUTH_WINDOW_MS } from "@/lib/server/account-deletion";

// Counsel §9 re-auth gate: deletion requires a recent sign-in, verified
// server-side. isReauthFresh must fail CLOSED so a missing/garbage value can
// never be treated as a valid recent re-auth.
describe("isReauthFresh", () => {
  it("accepts a sign-in inside the window", () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    expect(isReauthFresh(recent)).toBe(true);
  });

  it("rejects a sign-in older than the window", () => {
    const stale = new Date(
      Date.now() - REAUTH_WINDOW_MS - 60_000,
    ).toISOString();
    expect(isReauthFresh(stale)).toBe(false);
  });

  it("fails closed on null / undefined / empty", () => {
    expect(isReauthFresh(null)).toBe(false);
    expect(isReauthFresh(undefined)).toBe(false);
    expect(isReauthFresh("")).toBe(false);
  });

  it("fails closed on an unparseable timestamp", () => {
    expect(isReauthFresh("not-a-date")).toBe(false);
  });
});
