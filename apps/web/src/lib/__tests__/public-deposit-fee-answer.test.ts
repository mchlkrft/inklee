import { describe, it, expect } from "vitest";
import {
  publicCardDepositAvailability,
  publicCardDepositCopy,
  publicDepositFeeAnswer,
  publicDepositFeeFragment,
  type PublicCardDepositSurface,
} from "@inklee/shared/platform-fee";
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

  // The prose fragment, used by five OTHER public surfaces: the homepage twice,
  // /tattoo-deposit-tool twice, and the deposits guide. Two of those are
  // indexed, so the claim is published, not merely displayed.
  describe("publicDepositFeeFragment", () => {
    it("reproduces the previously hard-coded phrase EXACTLY under the active schedule", () => {
      expect(publicDepositFeeFragment()).toBe(
        "Inklee keeps a 3% fee that covers card processing",
      );
    });

    it("carries no trailing punctuation, since callers embed it mid-sentence", () => {
      for (const v of [FEE_SCHEDULE_V1.version, FEE_SCHEDULE_V2.version]) {
        expect(publicDepositFeeFragment(v)).not.toMatch(/[.,;]$/);
      }
    });

    it("under v2 drops both the 3% and the processing clause, and scopes to Plus", () => {
      const f = publicDepositFeeFragment(FEE_SCHEDULE_V2.version);
      expect(f).not.toContain("3%");
      expect(f).not.toContain("covers card processing");
      expect(f).toContain("0.5%");
      expect(f).toContain("on Plus");
    });

    // DISTINCTION: v1 and v2 must differ, so neither assertion above can be
    // satisfied by a constant string.
    it("DISTINCTION: v1 and v2 fragments differ", () => {
      expect(publicDepositFeeFragment(FEE_SCHEDULE_V1.version)).not.toBe(
        publicDepositFeeFragment(FEE_SCHEDULE_V2.version),
      );
    });
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

// #95: the AVAILABILITY FRAMING around the number. The fragment tests above
// bound the rate; these bind the sentence it sits in. All five surfaces used
// to hand-write "connect Stripe and clients can pay by card" around the
// fragment, which becomes false for Free at v2 (null rate: the lane is
// closed, not discounted) no matter what number the fragment substitutes.
describe("publicCardDepositCopy", () => {
  const SURFACES: PublicCardDepositSurface[] = [
    "home_faq",
    "home_feature",
    "tool_faq",
    "tool_hero",
    "guide",
  ];

  it("derives availability from the schedule: v1 all tiers, v2 Plus only", () => {
    expect(publicCardDepositAvailability(FEE_SCHEDULE_V1.version)).toBe(
      "all_tiers",
    );
    expect(publicCardDepositAvailability(FEE_SCHEDULE_V2.version)).toBe(
      "plus_only",
    );
    expect(publicCardDepositAvailability()).toBe(
      publicCardDepositAvailability(ACTIVE_FEE_SCHEDULE_VERSION),
    );
  });

  // THE REFACTOR IS A NO-OP TODAY, byte-for-byte per surface, same discipline
  // as publicDepositFeeAnswer above: nothing a visitor reads changes until the
  // schedule does. Each literal below is what its surface previously
  // hard-coded around the fragment.
  it("reproduces each surface's previously hard-coded span EXACTLY under the active schedule", () => {
    expect(publicCardDepositCopy("home_faq")).toBe(
      "Yes, and it is optional. You can request a deposit on an approved booking. Connect Stripe to let clients pay by card, and the deposit lands in your own Stripe account (Inklee keeps a 3% fee that covers card processing). Prefer not to? Collect deposits manually and mark them received.",
    );
    expect(publicCardDepositCopy("home_feature")).toBe(
      "Optional. Ask for a deposit on an approved request. Clients can pay by card into your own Stripe account (Inklee keeps a 3% fee that covers card processing), or you track a manual one. Status stays on the booking.",
    );
    expect(publicCardDepositCopy("tool_faq")).toBe(
      "Not for the booking workflow. Inklee keeps the deposit step on the request itself. Card collection is optional: connect Stripe and clients can pay the deposit by card into your own account (Inklee keeps a 3% fee that covers card processing), or you can track a deposit you collect manually. Either way, the paid and confirmed status stays on the booking.",
    );
    expect(publicCardDepositCopy("tool_hero")).toBe(
      "Card collection is optional. Connect Stripe and the deposit lands in your own account (Inklee keeps a 3% fee that covers card processing), or track a deposit you collect manually.",
    );
    expect(publicCardDepositCopy("guide")).toBe(
      "Clients can pay by card into your own Stripe account (Inklee keeps a 3% fee that covers card processing), or you track a deposit you collect your own way for free.",
    );
  });

  // THE POINT OF THE FILE, extended to the framing: under v2 every surface
  // must scope the card lane to Plus and keep manual tracking available,
  // and none may keep the universal "connect Stripe and pay by card" framing.
  it("under v2 every surface scopes the card lane to Plus and keeps manual tracking open", () => {
    for (const s of SURFACES) {
      const copy = publicCardDepositCopy(s, FEE_SCHEDULE_V2.version);
      expect(copy, s).toContain("Plus");
      // The guide surface says "you collect your own way" where the others
      // say "manually"; both are the manual lane staying open.
      expect(copy.toLowerCase(), s).toMatch(/manual|your own way/);
      expect(copy, s).not.toContain("3%");
    }
  });

  // DISTINCTION: neither the v1 pin nor the v2 scoping can be satisfied by a
  // constant per surface.
  it("DISTINCTION: v1 and v2 spans differ on every surface", () => {
    for (const s of SURFACES) {
      expect(publicCardDepositCopy(s, FEE_SCHEDULE_V1.version), s).not.toBe(
        publicCardDepositCopy(s, FEE_SCHEDULE_V2.version),
      );
    }
  });

  // House copy rules: public marketing strings, every surface, both schedules.
  it("carries no em-dash and ends in terminal punctuation on every surface", () => {
    for (const v of [FEE_SCHEDULE_V1.version, FEE_SCHEDULE_V2.version]) {
      for (const s of SURFACES) {
        const copy = publicCardDepositCopy(s, v);
        expect(copy, s).not.toContain("—");
        expect(copy.trim().endsWith("."), s).toBe(true);
      }
    }
  });
});
