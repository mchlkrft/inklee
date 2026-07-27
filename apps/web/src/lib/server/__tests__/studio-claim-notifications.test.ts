import { describe, it, expect, vi, beforeEach } from "vitest";

// Claim approval is committed BEFORE this notifier runs, so the contract under
// test is as much about what it refuses to do (throw) as what it sends.

const createNotification = vi.fn();
const sendEmail = vi.fn();
const getUserById = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications", () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { auth: { admin: { getUserById: () => getUserById() } } },
}));

import { notifyClaimApproved } from "@/lib/server/studio-claim-notifications";

beforeEach(() => {
  vi.clearAllMocks();
  createNotification.mockResolvedValue({ ok: true });
  sendEmail.mockResolvedValue(undefined);
  getUserById.mockResolvedValue({
    data: { user: { email: "owner@example.com" } },
  });
});

describe("notifyClaimApproved", () => {
  it("writes an in-app notification pointing at the studio cockpit", async () => {
    await notifyClaimApproved({ claimantId: "u1", studioName: "Ouchy Studio" });

    expect(createNotification).toHaveBeenCalledTimes(1);
    const arg = createNotification.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.artistId).toBe("u1");
    expect(arg.type).toBe("studio_claim_approved");
    expect(arg.ctaHref).toBe("/studio");
    expect(String(arg.message)).toContain("Ouchy Studio");
  });

  it("emails the claimant, addressed from their auth record", async () => {
    await notifyClaimApproved({ claimantId: "u1", studioName: "Ouchy Studio" });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0] as Record<string, string>;
    expect(mail.to).toBe("owner@example.com");
    expect(mail.subject).toContain("Ouchy Studio");
    expect(mail.html).toContain("Congratulations");
    // The CTA has to be absolute: an email client has no origin to resolve
    // "/studio" against.
    expect(mail.html).toContain("/studio");
    expect(mail.html).toMatch(/https?:\/\//);
  });

  it("escapes the studio name into the email body", async () => {
    await notifyClaimApproved({
      claimantId: "u1",
      studioName: '<script>alert("x")</script>',
    });

    const mail = sendEmail.mock.calls[0][0] as Record<string, string>;
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("still emails when the in-app notification write fails", async () => {
    // The two channels are independent; one failing must not silence the other.
    createNotification.mockRejectedValue(new Error("db down"));

    await expect(
      notifyClaimApproved({ claimantId: "u1", studioName: "Ouchy Studio" }),
    ).resolves.toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("never throws when the email send fails", async () => {
    // The approval is already committed upstream. Throwing here would surface
    // as a failed approval and invite a second run, which then hits "already
    // decided" and strands the admin.
    sendEmail.mockRejectedValue(new Error("resend 500"));

    await expect(
      notifyClaimApproved({ claimantId: "u1", studioName: "Ouchy Studio" }),
    ).resolves.toBeUndefined();
  });

  it("skips the email when the claimant has no address, without throwing", async () => {
    getUserById.mockResolvedValue({ data: { user: null } });

    await expect(
      notifyClaimApproved({ claimantId: "u1", studioName: "Ouchy Studio" }),
    ).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic name rather than emailing an empty subject", async () => {
    await notifyClaimApproved({ claimantId: "u1", studioName: "   " });

    const mail = sendEmail.mock.calls[0][0] as Record<string, string>;
    expect(mail.subject.trim()).not.toBe("is yours");
    expect(mail.subject).toContain("Your studio");
  });
});
