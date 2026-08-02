import { describe, it, expect, vi } from "vitest";
import { resolveMfaStepUp } from "../mfa-step-up";

// MFA-GATE-001: proxy.ts used to treat a thrown getAuthenticatorAssuranceLevel()
// call AND a non-throwing {data:null, error} result as "no step-up needed",
// silently letting an un-stepped-up AAL1 session through. resolveMfaStepUp is
// the extracted decision so both failure shapes, the two legitimate outcomes,
// and the retry can be pinned independent of the edge request/response plumbing.

describe("resolveMfaStepUp", () => {
  it("resolves 'unknown' when the AAL check throws on every attempt (fail-open path 1)", async () => {
    const getAal = vi.fn().mockRejectedValue(new Error("network blip"));

    const result = await resolveMfaStepUp(getAal);

    expect(result).toBe("unknown");
    // Mutation: change the catch block to `return "no-step-up-required"` (or
    // remove the loop and let the throw escape) — this test fails because the
    // thrown call would either crash the test or resolve to the wrong state.
  });

  it("resolves 'unknown' when the AAL check returns {data:null, error} on every attempt (fail-open path 2)", async () => {
    const getAal = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await resolveMfaStepUp(getAal);

    expect(result).toBe("unknown");
    // Mutation: change `if (!error && data)` to `if (data)` (drop the error
    // check) — this test fails because a null data with a truthy error would
    // still fall into the branch and misread nextLevel/currentLevel off null.
  });

  it("DISTINCTION: a user with no TOTP enrolled (aal1 -> aal1) resolves 'no-step-up-required'", async () => {
    const getAal = vi.fn().mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });

    const result = await resolveMfaStepUp(getAal);

    expect(result).toBe("no-step-up-required");
    // Mutation: change the comparison to `data.currentLevel !== "aal2"` (or
    // any variant that fails closed whenever nextLevel isn't determinably
    // "aal1") — this test fails because a legitimate unenrolled session would
    // now be reported as needing a step-up it can never complete.
  });

  it("DISTINCTION: an enrolled, already-stepped-up session (aal2 -> aal2) resolves 'no-step-up-required'", async () => {
    const getAal = vi.fn().mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    const result = await resolveMfaStepUp(getAal);

    expect(result).toBe("no-step-up-required");
    // Mutation: change the comparison to only check `nextLevel === "aal2"`
    // without also requiring `currentLevel === "aal1"` — this test fails
    // because an already-stepped-up session would be re-challenged forever.
  });

  it("still resolves 'step-up-required' for an enrolled, not-yet-stepped-up session (aal1 -> aal2)", async () => {
    const getAal = vi.fn().mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    const result = await resolveMfaStepUp(getAal);

    expect(result).toBe("step-up-required");
  });

  it("retries once and uses the successful result when the first attempt throws", async () => {
    const getAal = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        data: { currentLevel: "aal1", nextLevel: "aal1" },
        error: null,
      });

    const result = await resolveMfaStepUp(getAal);

    expect(result).toBe("no-step-up-required");
    expect(getAal).toHaveBeenCalledTimes(2);
    // Mutation: change `attempts` from 2 to 1 — this test fails because the
    // function would give up after the first (thrown) attempt and never see
    // the successful second call, returning "unknown" and calling getAal once.
  });
});
