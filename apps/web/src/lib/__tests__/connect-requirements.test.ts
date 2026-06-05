import { describe, it, expect } from "vitest";
import { describeRequirements } from "../connect-requirements";

describe("describeRequirements", () => {
  it("maps known Stripe requirement codes to artist-facing labels", () => {
    expect(describeRequirements(["external_account"])).toEqual([
      "Bank account (IBAN) for payouts",
    ]);
    expect(describeRequirements(["individual.verification.document"])).toEqual([
      "A photo of your ID document",
    ]);
  });

  it("collapses the several DOB / ToS codes to a single label each", () => {
    expect(
      describeRequirements([
        "individual.dob.day",
        "individual.dob.month",
        "individual.dob.year",
      ]),
    ).toEqual(["Date of birth"]);
    expect(
      describeRequirements(["tos_acceptance.date", "tos_acceptance.ip"]),
    ).toEqual(["Acceptance of the Stripe agreement"]);
  });

  it("humanises an unknown code instead of showing the raw dotted key", () => {
    expect(describeRequirements(["individual.ssn_last_4"])).toEqual([
      "Ssn last 4",
    ]);
  });

  it("returns an empty list for no requirements", () => {
    expect(describeRequirements([])).toEqual([]);
  });
});
