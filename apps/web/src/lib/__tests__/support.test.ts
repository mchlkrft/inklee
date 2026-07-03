import { describe, it, expect } from "vitest";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_REFERENCE_RE,
  isSupportStatus,
  isSupportCategory,
  canArtistReply,
  statusAfterArtistReply,
  statusAfterAdminReply,
  needsAdminAttention,
  hasUnansweredArtistReply,
  hasUnreadAdminReply,
  validateTicketInput,
  validateReplyBody,
  type SupportTicketInput,
} from "@/lib/support";

const validInput: SupportTicketInput = {
  subject: "Booking page shows an error",
  category: "public_page",
  description:
    "When a client opens my booking page and submits the form, they see an error page instead of the confirmation.",
  expectedBehavior: "The client sees the request confirmation.",
  actualBehavior: "The client sees a generic error page.",
  reproductionSteps: "",
  relevantArea: "",
  deviceInfo: "",
  platformInfo: "",
  additionalContext: "",
};

describe("support status machine", () => {
  it("artist replies reopen or keep the ticket awaiting support", () => {
    expect(statusAfterArtistReply("open")).toBe("awaiting_support");
    expect(statusAfterArtistReply("awaiting_support")).toBe("awaiting_support");
    expect(statusAfterArtistReply("awaiting_artist")).toBe("awaiting_support");
    expect(statusAfterArtistReply("resolved")).toBe("awaiting_support");
  });

  it("closed tickets are read-only for artists", () => {
    expect(canArtistReply("closed")).toBe(false);
    expect(statusAfterArtistReply("closed")).toBe(null);
  });

  it("artists can reply in every non-closed state", () => {
    for (const s of SUPPORT_STATUSES) {
      expect(canArtistReply(s)).toBe(s !== "closed");
    }
  });

  it("admin replies flip to awaiting artist unless explicitly overridden", () => {
    expect(statusAfterAdminReply(null)).toBe("awaiting_artist");
    expect(statusAfterAdminReply("resolved")).toBe("resolved");
    expect(statusAfterAdminReply("closed")).toBe("closed");
  });
});

describe("attention and unread derivations", () => {
  it("open and awaiting_support need admin attention", () => {
    expect(needsAdminAttention({ status: "open" })).toBe(true);
    expect(needsAdminAttention({ status: "awaiting_support" })).toBe(true);
    expect(needsAdminAttention({ status: "awaiting_artist" })).toBe(false);
    expect(needsAdminAttention({ status: "resolved" })).toBe(false);
    expect(needsAdminAttention({ status: "closed" })).toBe(false);
  });

  it("detects artist replies newer than the last admin reply", () => {
    expect(
      hasUnansweredArtistReply({
        last_artist_reply_at: "2026-07-04T10:00:00Z",
        last_admin_reply_at: null,
      }),
    ).toBe(true);
    expect(
      hasUnansweredArtistReply({
        last_artist_reply_at: "2026-07-04T10:00:00Z",
        last_admin_reply_at: "2026-07-04T09:00:00Z",
      }),
    ).toBe(true);
    expect(
      hasUnansweredArtistReply({
        last_artist_reply_at: "2026-07-04T08:00:00Z",
        last_admin_reply_at: "2026-07-04T09:00:00Z",
      }),
    ).toBe(false);
    expect(
      hasUnansweredArtistReply({
        last_artist_reply_at: null,
        last_admin_reply_at: null,
      }),
    ).toBe(false);
  });

  it("detects admin replies the artist has not seen", () => {
    expect(
      hasUnreadAdminReply({
        last_admin_reply_at: "2026-07-04T10:00:00Z",
        artist_seen_at: null,
      }),
    ).toBe(true);
    expect(
      hasUnreadAdminReply({
        last_admin_reply_at: "2026-07-04T10:00:00Z",
        artist_seen_at: "2026-07-04T09:00:00Z",
      }),
    ).toBe(true);
    expect(
      hasUnreadAdminReply({
        last_admin_reply_at: "2026-07-04T10:00:00Z",
        artist_seen_at: "2026-07-04T11:00:00Z",
      }),
    ).toBe(false);
    expect(
      hasUnreadAdminReply({ last_admin_reply_at: null, artist_seen_at: null }),
    ).toBe(false);
  });
});

describe("ticket input validation", () => {
  it("accepts a complete report", () => {
    expect(validateTicketInput(validInput)).toBe(null);
  });

  it("rejects extremely short or missing required fields", () => {
    expect(validateTicketInput({ ...validInput, subject: "Hi" })).toContain(
      "subject",
    );
    expect(
      validateTicketInput({ ...validInput, description: "It broke" }),
    ).toContain("more detail");
    expect(
      validateTicketInput({ ...validInput, expectedBehavior: "" }),
    ).toContain("expected");
    expect(
      validateTicketInput({ ...validInput, actualBehavior: "" }),
    ).toContain("actually happened");
  });

  it("rejects an unknown category", () => {
    expect(validateTicketInput({ ...validInput, category: "hacking" })).toBe(
      "Pick a category.",
    );
  });

  it("caps overlong fields", () => {
    expect(
      validateTicketInput({ ...validInput, subject: "x".repeat(151) }),
    ).toContain("at most");
    expect(
      validateTicketInput({
        ...validInput,
        additionalContext: "x".repeat(2001),
      }),
    ).toContain("at most");
  });
});

describe("reply validation", () => {
  it("rejects empty replies and accepts real ones", () => {
    expect(validateReplyBody("  ")).toBe("Write a reply before sending.");
    expect(validateReplyBody("Here is more information.")).toBe(null);
    expect(validateReplyBody("x".repeat(5001))).toContain("at most");
  });
});

describe("reference format", () => {
  it("matches INK-<number> only", () => {
    expect(SUPPORT_REFERENCE_RE.test("INK-1042")).toBe(true);
    expect(SUPPORT_REFERENCE_RE.test("INK-1")).toBe(true);
    expect(SUPPORT_REFERENCE_RE.test("ink-1042")).toBe(false);
    expect(SUPPORT_REFERENCE_RE.test("INK-")).toBe(false);
    expect(SUPPORT_REFERENCE_RE.test("TICKET-9")).toBe(false);
  });
});

describe("labels", () => {
  it("every status and category has a sentence-case label", () => {
    for (const s of SUPPORT_STATUSES) {
      expect(SUPPORT_STATUS_LABELS[s]).toBeTruthy();
      expect(isSupportStatus(s)).toBe(true);
    }
    for (const c of SUPPORT_CATEGORIES) {
      expect(SUPPORT_CATEGORY_LABELS[c]).toBeTruthy();
      expect(isSupportCategory(c)).toBe(true);
    }
    expect(isSupportStatus("deleted")).toBe(false);
    expect(isSupportCategory("misc")).toBe(false);
  });
});
