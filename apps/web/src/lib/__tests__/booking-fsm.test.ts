import { describe, it, expect } from "vitest";
import { canTransition, isTerminal, type BookingStatus } from "../booking-fsm";

// The booking FSM gates EVERY status mutation in lib/server/bookings.ts (web +
// mobile) and the public token portal, and the conditional-UPDATE money-path
// fixes rely on canTransition having already validated the move. This test pins
// the exact allowed-transition matrix so an accidental edit — e.g. re-allowing
// approved->pending, or making a terminal state non-terminal — fails the build.

const STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "rejected",
  "deposit_pending",
  "cancelled",
];

// Mirror of TRANSITIONS in packages/shared/src/booking-fsm.ts. Kept here on
// purpose: it is the assertion. If the source matrix changes, this must change
// in lockstep, which is the safety we want.
const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  pending: ["approved", "rejected", "deposit_pending", "cancelled"],
  deposit_pending: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"],
  rejected: [],
  cancelled: [],
};

describe("canTransition — full 5x5 matrix", () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const expected = ALLOWED[from].includes(to);
      it(`${from} -> ${to} is ${expected ? "allowed" : "blocked"}`, () => {
        expect(canTransition(from, to).ok).toBe(expected);
      });
    }
  }
});

describe("canTransition — reason shape", () => {
  it("rejects an unknown source status with a clear reason", () => {
    const r = canTransition("bogus", "approved" as BookingStatus);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown status: bogus");
  });

  it("distinguishes a terminal block from an invalid-move block", () => {
    const terminal = canTransition("rejected", "approved");
    expect(terminal.ok).toBe(false);
    // substring, not exact text, so the copy sweep can reword without breaking
    if (!terminal.ok) expect(terminal.reason).toContain("already");

    const invalid = canTransition("approved", "pending");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.reason).toContain("cannot move");
  });
});

describe("isTerminal", () => {
  it("is true only for rejected and cancelled", () => {
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("approved")).toBe(false);
    expect(isTerminal("deposit_pending")).toBe(false);
  });

  it("is false for an unknown status", () => {
    expect(isTerminal("bogus")).toBe(false);
  });
});
