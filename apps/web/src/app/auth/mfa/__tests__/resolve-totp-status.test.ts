import { describe, it, expect, vi } from "vitest";
import { resolveTotpStatus } from "../resolve-totp-status";

// MFA-GATE-001, half two: apps/web/src/app/auth/mfa/page.tsx used to derive
// "no TOTP enrolled" from `factors?.totp?.[0]` being falsy, which is also what
// a FAILED listFactors() call looks like — so a transient failure sent an
// enrolled, not-yet-stepped-up session straight to /dashboard. resolveTotpStatus
// is the extracted decision so the failure mode, both legitimate outcomes, and
// the retry can be pinned without a DOM/component test harness (none exists in
// this repo's vitest config — see apps/web/vitest.config.ts, node env, *.test.ts
// only).

describe("resolveTotpStatus", () => {
  it("resolves 'unknown' when listFactors throws on every attempt (the page's fail-open path)", async () => {
    const listFactors = vi.fn().mockRejectedValue(new Error("network blip"));

    const result = await resolveTotpStatus(listFactors);

    expect(result).toEqual({ status: "unknown" });
    // Mutation: revert to the old shape — `const totp = data?.totp?.[0]; if
    // (!totp) return {status: "not-enrolled"}` without checking `error` first
    // — this test fails because a thrown/undefined read would resolve to
    // "not-enrolled" instead of "unknown".
  });

  it("resolves 'unknown' when listFactors returns {data:null, error} on every attempt", async () => {
    const listFactors = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await resolveTotpStatus(listFactors);

    expect(result).toEqual({ status: "unknown" });
    // Mutation: drop the `!error` half of the guard (`if (data)` only) — this
    // test fails because `data` is null so it still falls through to
    // `data?.totp?.[0]` and reports "not-enrolled" instead of "unknown".
  });

  it("DISTINCTION: a user with no TOTP enrolled resolves 'not-enrolled' (still reaches /dashboard)", async () => {
    const listFactors = vi
      .fn()
      .mockResolvedValue({ data: { totp: [] }, error: null });

    const result = await resolveTotpStatus(listFactors);

    expect(result).toEqual({ status: "not-enrolled" });
    // Mutation: make the "unknown" fallback fire whenever the totp array is
    // empty (treat empty as failure) — this test fails because a genuinely
    // unenrolled user would now be reported as "unknown" and get stuck on the
    // MFA page instead of reaching /dashboard.
  });

  it("resolves 'enrolled' with the factor id for a session with a TOTP factor", async () => {
    const listFactors = vi.fn().mockResolvedValue({
      data: { totp: [{ id: "factor-123" }] },
      error: null,
    });

    const result = await resolveTotpStatus(listFactors);

    expect(result).toEqual({ status: "enrolled", factorId: "factor-123" });
  });

  it("retries once and uses the successful result when the first attempt throws", async () => {
    const listFactors = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ data: { totp: [] }, error: null });

    const result = await resolveTotpStatus(listFactors);

    expect(result).toEqual({ status: "not-enrolled" });
    expect(listFactors).toHaveBeenCalledTimes(2);
  });
});
