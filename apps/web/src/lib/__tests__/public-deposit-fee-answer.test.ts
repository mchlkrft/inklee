import { describe, it, expect } from "vitest";
import { publicDepositFeeAnswer } from "@inklee/shared/platform-fee";
import {
  FEE_SCHEDULE_V1,
  FEE_SCHEDULE_V2,
  ACTIVE_FEE_SCHEDULE_VERSION,
} from "@inklee/shared/fee-schedule";

/**
 * The public pricing page's deposit-fee answer.
 *
 * The defect this replaces was a hard-coded sentence, "Card deposits collected
 * through Inklee carry a flat 3% fee with card processing included.", bound to
 * neither the fee schedule nor the A7 claim predicate. It is TRUE today, which
 * is exactly why nobody noticed, and it goes wrong on two independent axes the
 * day v2 activates.
 *
 * So the v2 assertions below are the point of this file. They are not testing
 * behaviour anyone can see yet; they are the thing that makes the activation of
 * v2 a red test rather than a public page quietly telling visitors a false
 * price. Do not delete them because "v2 is not live".
 */

describe("publicDepositFeeAnswer", () => {
  it("under v1 (active today) states the flat rate and the processing claim", () => {
    const answer = publicDepositFeeAnswer(FEE_SCHEDULE_V1.version);
    expect(answer).toContain("flat 3% fee");
    // 300bps is above the 150bps processing reference, so the claim stands on
    // its own without any founder approval row.
    expect(answer).toContain("with card processing included");
    expect(answer).toContain("Your client always pays exactly the deposit");
    expect(answer).toContain("Manual deposit tracking stays free.");
  });

  it("the default (no version) matches the ACTIVE schedule, not a hard-coded one", () => {
    expect(publicDepositFeeAnswer()).toBe(
      publicDepositFeeAnswer(ACTIVE_FEE_SCHEDULE_VERSION),
    );
  });

  // THE REFACTOR IS A NO-OP TODAY, asserted byte-for-byte against the literal
  // that was previously hard-coded in pricing/page.tsx. This is what separates
  // "bound the copy to its source" from "rewrote the public pricing copy":
  // nothing a visitor reads changes until the schedule does. If a future edit
  // to the wording is intended, this assertion is the one that should be
  // updated deliberately rather than the page quietly drifting.
  it("reproduces the previously hard-coded sentence EXACTLY under the active schedule", () => {
    expect(publicDepositFeeAnswer()).toBe(
      "Card deposits collected through Inklee carry a flat 3% fee with card processing included. Your client always pays exactly the deposit amount. Manual deposit tracking stays free.",
    );
  });

  // AXIS 1: the rate. Free cannot transact the lane at all under v2
  // (appointmentPayment.free === null), and Plus drops to 0.5%.
  it("under v2 stops claiming a flat 3% and names the Plus rate", () => {
    const answer = publicDepositFeeAnswer(FEE_SCHEDULE_V2.version);
    expect(answer).not.toContain("3%");
    expect(answer).toContain("0.5%");
  });

  // PRESENCE, NOT MAGNITUDE. A null rate means "cannot use this lane", and
  // rendering it as "0%" would read as free of charge. fee-schedule.ts calls
  // this out explicitly; this pins that the copy layer honours it.
  it("under v2 says Free CANNOT collect, never that it is 0%", () => {
    const answer = publicDepositFeeAnswer(FEE_SCHEDULE_V2.version);
    expect(answer).not.toContain("0%");
    expect(answer).toContain("Plus feature");
  });

  // AXIS 2: the claim. At 0.5% the fee is below the 150bps processing
  // reference for EVERY amount, so the processing-included clause must
  // disappear from a public page rather than rest on a per-artist approval row
  // that a visitor is not covered by.
  it("under v2 DROPS the processing-included clause, because 0.5% never covers cost", () => {
    const answer = publicDepositFeeAnswer(FEE_SCHEDULE_V2.version);
    expect(answer).not.toContain("card processing included");
  });

  // DISTINCTION CONTROL. Without this, a function that never emitted the
  // clause at all would pass the v2 test above. The v1 test asserts presence
  // and this asserts the two versions genuinely differ, so neither can be
  // satisfied by a constant.
  it("DISTINCTION: v1 and v2 produce different answers", () => {
    expect(publicDepositFeeAnswer(FEE_SCHEDULE_V1.version)).not.toBe(
      publicDepositFeeAnswer(FEE_SCHEDULE_V2.version),
    );
  });

  // House copy rules apply: this is a public marketing string.
  it("carries no em-dash and ends in terminal punctuation", () => {
    for (const v of [FEE_SCHEDULE_V1.version, FEE_SCHEDULE_V2.version]) {
      const answer = publicDepositFeeAnswer(v);
      expect(answer).not.toContain("—");
      expect(answer.trim().endsWith(".")).toBe(true);
    }
  });
});
