import { describe, it, expect, vi, beforeEach } from "vitest";

// #79 / Q16 element 1 + 4: the "image of me without consent" report category
// and the Art. 16(5) acknowledgement that rides it for free. The action's own
// tests did not exist before this file. The point is (c): the acknowledgement
// fires for the NEW category with NO per-category branch, which is what makes
// element 4 "free with element 1" (round-5 §4.2) true rather than assumed.

const { mockSendEmail, mockQueue } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockQueue: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/content-reports", () => ({
  queueContentReport: (...a: unknown[]) => mockQueue(...a),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }),
}));
vi.mock("@/lib/honeypot", () => ({
  HONEYPOT_FIELD: "hp",
  isHoneypotTriggered: () => false,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...a: unknown[]) => mockSendEmail(...a),
}));
vi.mock("@/lib/ratelimit", () => ({
  checkReportRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/get-client-ip", () => ({ getClientIp: () => "1.2.3.4" }));

import { submitReportAction } from "../actions";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
} from "@/lib/legal/report-categories";

function form(category: string, over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("category", category);
  fd.set("url", "https://inklee.app/somebody/hub");
  fd.set(
    "description",
    "This photograph shows me and I did not consent to it being posted on the gallery.",
  );
  fd.set("reporter_name", "Dana Doe");
  fd.set("reporter_email", "dana@example.com");
  fd.set("good_faith", "yes");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
  mockQueue.mockResolvedValue({ id: "cr_test" });
});

describe("submitReportAction: image_without_consent category (#79 Q16 e1/e4)", () => {
  it("accepts the new image_without_consent category and reports sent", async () => {
    const res = await submitReportAction(null, form("image_without_consent"));
    expect(res).toMatchObject({ sent: true });
  });

  it("still rejects an unknown category", async () => {
    const res = await submitReportAction(null, form("not_a_category"));
    expect(res).toMatchObject({
      error: "select a category",
      field: "category",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends BOTH the operator email and the Art.16(5) acknowledgement, carrying the new label", async () => {
    await submitReportAction(null, form("image_without_consent"));
    // Two emails: operator notice + reporter acknowledgement. The ack fires for
    // every category (the only per-category branch is the additive 72h aim
    // below), so proving it fires for the NEW category is proving element 4
    // comes for free with element 1.
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const tos = mockSendEmail.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(tos).toContain("support@inklee.app");
    expect(tos).toContain("dana@example.com");
    const html = mockSendEmail.mock.calls
      .map((c) => (c[0] as { html: string }).html)
      .join("\n");
    expect(html).toContain("Image of me without consent");
  });

  it("the image_without_consent ack carries the 72-hour aim (R6 Q3), other categories do not", async () => {
    await submitReportAction(null, form("image_without_consent"));
    const ackFor = (email: string) =>
      mockSendEmail.mock.calls
        .map((c) => c[0] as { to: string; html: string })
        .find((m) => m.to === email)?.html ?? "";
    expect(ackFor("dana@example.com")).toContain("72 hours");

    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    mockQueue.mockResolvedValue({ id: "cr_test" });
    const other = REPORT_CATEGORIES.find(
      (c) => c.value !== "image_without_consent",
    );
    expect(other).toBeTruthy();
    await submitReportAction(null, form(other!.value));
    expect(ackFor("dana@example.com")).not.toContain("72 hours");
  });

  it("DRIFT: the form's category values and the label map are the exact same set", () => {
    // Only assertable because both now derive from the shared .ts module.
    const formValues = REPORT_CATEGORIES.map((c) => c.value).sort();
    const labelKeys = Object.keys(REPORT_CATEGORY_LABELS).sort();
    expect(formValues).toEqual(labelKeys);
    expect(REPORT_CATEGORY_LABELS["image_without_consent"]).toBe(
      "Image of me without consent",
    );
  });

  it("QUEUE (element 2): a valid submission writes a durable content_reports row", async () => {
    await submitReportAction(null, form("image_without_consent"));
    expect(mockQueue).toHaveBeenCalledTimes(1);
    expect(mockQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "image_without_consent",
        reporterEmail: "dana@example.com",
        url: "https://inklee.app/somebody/hub",
      }),
    );
  });

  it("QUEUE is load-bearing (DSA-QUE-001): a queue-write failure returns an error and sends NO emails, never a false success", async () => {
    // Counsel's Q16 element (2) rejects the email-only state, so a failure to
    // write the durable content_reports row must surface a reporter error and
    // must NOT report success or fall through to the notifications.
    mockQueue.mockResolvedValue({ error: "boom" });
    const res = await submitReportAction(null, form("image_without_consent"));
    expect(res).toMatchObject({ error: expect.stringContaining("try again") });
    expect(res).not.toMatchObject({ sent: true });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
