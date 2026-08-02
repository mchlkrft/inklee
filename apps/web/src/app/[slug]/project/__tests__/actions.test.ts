import { describe, it, expect, vi, beforeEach } from "vitest";

// ABUSE-PUB-001: the public project intake had none of the five abuse
// controls its sibling, the public booking intake (apps/web/src/app/[slug]/
// actions.ts), already applies. These pin the three controls that live in
// THIS action (honeypot, origin check, rate limit) plus a distinction test
// proving a legitimate submission still goes through. The other two controls
// (MIME allowlist, dedupe) live in submitProjectIntakeCore and are covered in
// apps/web/src/lib/server/__tests__/projects.test.ts.

const h = vi.hoisted(() => ({
  profileLookup: vi.fn(),
  submitProjectIntakeCore: vi.fn(),
  checkProjectIntakeRateLimit: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

let headerMap: Record<string, string>;

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => h.profileLookup(),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test mock: ${table}`);
    },
  },
}));

vi.mock("@/lib/server/projects", () => ({
  submitProjectIntakeCore: (...a: unknown[]) => h.submitProjectIntakeCore(...a),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkProjectIntakeRateLimit: (...a: unknown[]) =>
    h.checkProjectIntakeRateLimit(...a),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => h.redirect(url),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(headerMap),
}));

import { submitProjectIntakeAction } from "../actions";
import { HONEYPOT_FIELD } from "@/lib/honeypot";

function baseFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("slug", "ada");
  fd.set("title", "Full sleeve");
  fd.set("description", "A long description of the planned piece.");
  fd.set("scale", "sleeve");
  fd.set("customerEmail", "client@example.com");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://inklee.app";
  headerMap = {
    origin: "https://inklee.app",
    "x-forwarded-for": "203.0.113.5",
  };
  h.profileLookup.mockResolvedValue({ data: { id: "artist-1" } });
  h.checkProjectIntakeRateLimit.mockResolvedValue({ allowed: true });
  h.submitProjectIntakeCore.mockResolvedValue({
    ok: true,
    projectId: "proj-1",
    portalToken: "a".repeat(64),
  });
});

describe("submitProjectIntakeAction abuse controls (ABUSE-PUB-001)", () => {
  it("silently absorbs a honeypot-tripped submission", async () => {
    // Mirrors the booking intake's choice (apps/web/src/app/[slug]/actions.ts:56):
    // return null rather than a distinguishable error, so a bot cannot learn
    // which field trips the trap.
    const fd = baseFormData({ [HONEYPOT_FIELD]: "https://spam.example.com" });
    const r = await submitProjectIntakeAction(null, fd);
    expect(r).toBeNull();
    expect(h.profileLookup).not.toHaveBeenCalled();
    expect(h.checkProjectIntakeRateLimit).not.toHaveBeenCalled();
    expect(h.submitProjectIntakeCore).not.toHaveBeenCalled();
  });

  it("refuses a request from an unexpected origin", async () => {
    headerMap.origin = "https://evil.example.com";
    const r = await submitProjectIntakeAction(null, baseFormData());
    expect(r).toMatchObject({ error: "Invalid request origin." });
    expect(h.profileLookup).not.toHaveBeenCalled();
    expect(h.submitProjectIntakeCore).not.toHaveBeenCalled();
  });

  it("refuses once the per-artist-per-IP rate limit is spent", async () => {
    h.checkProjectIntakeRateLimit.mockResolvedValue({ allowed: false });
    const r = await submitProjectIntakeAction(null, baseFormData());
    expect(r).toMatchObject({
      error: "Too many requests. Please wait before submitting again.",
    });
    expect(h.submitProjectIntakeCore).not.toHaveBeenCalled();
  });

  it("keys the rate limit to the resolved artist and the caller's IP", async () => {
    await submitProjectIntakeAction(null, baseFormData()).catch(() => {});
    expect(h.checkProjectIntakeRateLimit).toHaveBeenCalledWith(
      "203.0.113.5",
      "artist-1",
    );
  });

  // Distinction: a request with no honeypot fill, an allowed origin and an
  // unspent rate limit must still reach the core and redirect — a form that
  // silently refuses everything would pass every test above.
  it("still submits a legitimate request", async () => {
    await expect(
      submitProjectIntakeAction(null, baseFormData()),
    ).rejects.toThrow(/^REDIRECT:/);
    expect(h.submitProjectIntakeCore).toHaveBeenCalledTimes(1);
    expect(h.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/project/"),
    );
  });

  // An absent Origin header (some privacy modes strip it) must not be
  // mistaken for an attack — isAllowedBookingOrigin treats it as acceptable,
  // matching the booking form's own behaviour.
  it("still submits when the Origin header is absent", async () => {
    headerMap = { "x-forwarded-for": "203.0.113.5" };
    await expect(
      submitProjectIntakeAction(null, baseFormData()),
    ).rejects.toThrow(/^REDIRECT:/);
    expect(h.submitProjectIntakeCore).toHaveBeenCalledTimes(1);
  });
});
