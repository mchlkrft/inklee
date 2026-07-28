import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));

import {
  clientNotifiableStatus,
  PROJECT_CLIENT_STATUS_COPY,
} from "@/lib/email/project-emails";
import { PROJECT_STATUSES } from "@inklee/shared/projects";

describe("which statuses reach the client", () => {
  it("emails only the four that mean something to them", () => {
    const notifiable = PROJECT_STATUSES.filter(clientNotifiableStatus);
    expect(notifiable.sort()).toEqual(
      ["active", "completed", "consultation", "declined"].sort(),
    );
  });

  // `submitted` is covered by the receipt; `under_review` is the artist's
  // internal triage; `archived` is them tidying their own list.
  it("stays quiet on submitted, under_review and archived", () => {
    for (const s of ["submitted", "under_review", "archived"] as const) {
      expect(clientNotifiableStatus(s), s).toBe(false);
    }
  });
});

describe("client copy follows the founder rules", () => {
  const strings = Object.values(PROJECT_CLIENT_STATUS_COPY).flatMap((c) =>
    c ? [c.body, c.subject("Ada")] : [],
  );

  it("has copy for every notifiable status", () => {
    expect(strings.length).toBe(8); // 4 statuses x (subject + body)
    for (const s of strings) expect(s.trim()).not.toBe("");
  });

  it("contains no em-dashes", () => {
    for (const s of strings) expect(s).not.toContain("—");
  });

  it("ends full sentences with terminal punctuation", () => {
    for (const c of Object.values(PROJECT_CLIENT_STATUS_COPY)) {
      if (c) expect(c.body.trim().endsWith(".")).toBe(true);
    }
  });

  it("names the artist in every subject", () => {
    for (const c of Object.values(PROJECT_CLIENT_STATUS_COPY)) {
      if (c) expect(c.subject("Ada")).toContain("Ada");
    }
  });

  // A decline is the one a client is most likely to read closely.
  it("says a decline plainly, without false hope", () => {
    const declined = PROJECT_CLIENT_STATUS_COPY.declined;
    expect(declined?.body).toContain("not able to take this one on");
  });
});
