import { describe, it, expect, vi, beforeEach } from "vitest";

// Same harness shape as activation.test.ts: mock the service-role client so
// the approvals reader returns controlled rows.
const selectMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: () => ({ select: selectMock }) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import {
  DPIA_GATE_PRECONDITIONS,
  DPIA_PRECONDITION_KEYS,
  DpiaPreconditionError,
  assertDpiaPreconditionsMet,
  missingDpiaPreconditions,
} from "@/lib/server/billing/dpia-gate-preconditions";

/** Approval rows in the shape getActivationApprovals reads. */
function rows(approved: string[]) {
  return {
    data: approved.map((k) => ({
      approval_key: k,
      approved: true,
      group_name: "b2c",
    })),
    error: null,
  };
}

const ALL = Object.values(DPIA_PRECONDITION_KEYS);

beforeEach(() => {
  selectMock.mockReset();
});

describe("LO-5 DPIA gate preconditions", () => {
  // The key strings ARE the contract with the approvals ledger. Renaming one
  // silently un-gates its precondition, because a key nobody records is
  // indistinguishable from a key nobody requires. Pinned by name deliberately.
  it("pins the exact key strings the ledger is recorded against", () => {
    expect(DPIA_PRECONDITION_KEYS).toEqual({
      uploadAttestation: "dpia_r3_direct_upload_attestation_built",
      signedGalleryUrls: "dpia_r4_signed_gallery_urls_built",
      intakePurge: "dpia_r6_intake_retention_purge_built",
      // R1, added per round-5 §4.2: the one adopted mitigation that had no
      // key, so the gallery grant rested on an undischarged condition with
      // nothing to stop it.
      noticeAndAction: "dpia_r1_notice_and_action_built",
    });
  });

  // FAILS IF the §7 table is transcribed wrongly. R6 gates BOTH gates, which
  // is the row most likely to be dropped since R3 and R4 are gallery-only.
  it("maps §7 to the gates: R1+R3+R4+R6 gallery, R6 goods", () => {
    expect([...DPIA_GATE_PRECONDITIONS.gallery].sort()).toEqual(
      [...ALL].sort(),
    );
    expect(DPIA_GATE_PRECONDITIONS.goods).toEqual([
      DPIA_PRECONDITION_KEYS.intakePurge,
    ]);
  });

  it("refuses the gallery gate when nothing is recorded", async () => {
    selectMock.mockResolvedValue(rows([]));
    await expect(assertDpiaPreconditionsMet("gallery")).rejects.toBeInstanceOf(
      DpiaPreconditionError,
    );
  });

  // The precise failure this guard exists for: the gallery capability granted
  // while signed URLs are unbuilt. Counsel resolved Q18 as "before the
  // capability is granted to anyone", and the controller adopted it in §7.
  it("refuses the gallery gate when only signed URLs are missing", async () => {
    selectMock.mockResolvedValue(
      rows([
        DPIA_PRECONDITION_KEYS.uploadAttestation,
        DPIA_PRECONDITION_KEYS.intakePurge,
        DPIA_PRECONDITION_KEYS.noticeAndAction,
      ]),
    );
    const missing = await missingDpiaPreconditions("gallery");
    expect(missing).toEqual([DPIA_PRECONDITION_KEYS.signedGalleryUrls]);
  });

  // R6 gates goods even though it is an image-retention item, because the
  // intake form is already live. Dropping it from the goods list is the
  // plausible transcription error.
  it("refuses the goods gate on the intake purge alone", async () => {
    selectMock.mockResolvedValue(
      rows([
        DPIA_PRECONDITION_KEYS.uploadAttestation,
        DPIA_PRECONDITION_KEYS.signedGalleryUrls,
      ]),
    );
    await expect(assertDpiaPreconditionsMet("goods")).rejects.toThrow(
      /dpia_r6_intake_retention_purge_built/,
    );
  });

  // DISTINCTION CONTROL. A guard that refuses everything passes every test
  // above. These two prove it opens when the conditions are genuinely met,
  // which is the only thing separating a working gate from a broken one.
  it("DISTINCTION: opens the goods gate once R6 is recorded", async () => {
    selectMock.mockResolvedValue(rows([DPIA_PRECONDITION_KEYS.intakePurge]));
    await expect(assertDpiaPreconditionsMet("goods")).resolves.toBeUndefined();
    expect(await missingDpiaPreconditions("goods")).toEqual([]);
  });

  it("DISTINCTION: opens the gallery gate once all four are recorded", async () => {
    selectMock.mockResolvedValue(rows(ALL));
    await expect(
      assertDpiaPreconditionsMet("gallery"),
    ).resolves.toBeUndefined();
  });

  // A row present but NOT approved must not count. Otherwise recording the
  // intention to do the work would open the gate.
  it("does not count an unapproved row as met", async () => {
    selectMock.mockResolvedValue({
      data: [
        {
          approval_key: DPIA_PRECONDITION_KEYS.intakePurge,
          approved: false,
          group_name: "b2c",
        },
      ],
      error: null,
    });
    expect(await missingDpiaPreconditions("goods")).toEqual([
      DPIA_PRECONDITION_KEYS.intakePurge,
    ]);
  });

  // FAIL LOUD, never fail open. A failed read must not resolve to "nothing
  // missing" - that is the exact defect class removed across this codebase on
  // 2026-08-02, where a discarded read error became a permissive default.
  it("throws on a read failure rather than reporting the gate clear", async () => {
    selectMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    await expect(missingDpiaPreconditions("goods")).rejects.toThrow();
  });

  it("names every missing key in the error, not just the first", async () => {
    selectMock.mockResolvedValue(rows([]));
    const err = await assertDpiaPreconditionsMet("gallery").catch((e) => e);
    for (const key of ALL) expect(String(err.message)).toContain(key);
  });
});
