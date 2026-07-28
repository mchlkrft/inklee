import { describe, it, expect, vi, beforeEach } from "vitest";

// P0 rejection-path tests (plus-build-plan.md): the custom-template save gate
// on BOTH surfaces. The 2026-07-28 audit found the enforcement real but the
// rejection paths untested; these pin them so a refactor cannot silently turn
// the gate permissive.

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
  getAccountOverrides: vi.fn(),
  canEditTemplates: vi.fn(),
  requireMobileUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from: () => ({ upsert: h.upsert }),
  }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => h.getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  canEditTemplates: (...a: unknown[]) => h.canEditTemplates(...a),
}));
vi.mock("@/lib/server/mobile-auth", () => ({
  requireMobileUser: (...a: unknown[]) => h.requireMobileUser(...a),
  mobileOk: (data: unknown) => Response.json({ data }),
  mobileError: (status: number, message: string, code?: string) =>
    Response.json({ error: { code: code ?? "error", message } }, { status }),
}));

import { saveTemplateAction } from "../actions";
import { POST as mobileSaveTemplate } from "@/app/api/mobile/settings/email-templates/route";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getUser.mockResolvedValue({ data: { user: { id: "artist-1" } } });
  h.upsert.mockResolvedValue({ error: null });
  h.getAccountOverrides.mockResolvedValue({});
  h.canEditTemplates.mockReturnValue(false);
});

describe("saveTemplateAction (web)", () => {
  it("refuses an unentitled save BEFORE any write", async () => {
    const r = await saveTemplateAction(
      null,
      form({
        type: "customer_booking_submitted",
        body: "Hi {{customer_name}}",
      }),
    );
    expect(r).toEqual({
      error:
        "Custom email templates are a Plus feature. Upgrade to Plus to edit them.",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("saves when entitled", async () => {
    h.canEditTemplates.mockReturnValue(true);
    const r = await saveTemplateAction(
      null,
      form({
        type: "customer_booking_submitted",
        body: "Hi {{customer_name}}",
      }),
    );
    expect(r).toEqual({ success: true });
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("fails OPEN when the plan read blows up (paused capability stays inert)", async () => {
    h.getAccountOverrides.mockRejectedValue(new Error("db down"));
    h.canEditTemplates.mockReturnValue(false); // never reached
    const r = await saveTemplateAction(
      null,
      form({
        type: "customer_booking_submitted",
        body: "Hi {{customer_name}}",
      }),
    );
    expect(r).toEqual({ success: true });
  });
});

describe("POST /api/mobile/settings/email-templates", () => {
  it("403s not_entitled for an unentitled save, before any write", async () => {
    h.requireMobileUser.mockResolvedValue({
      ok: true,
      userId: "artist-1",
      supabase: { from: () => ({ upsert: h.upsert }) },
    });
    const res = await mobileSaveTemplate(
      new Request("http://test/api/mobile/settings/email-templates", {
        method: "POST",
        body: JSON.stringify({
          type: "customer_booking_submitted",
          body: "Hi {{customer_name}}",
        }),
      }),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(json.error.code).toBe("not_entitled");
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
