// The lifecycle dry-run endpoint: fail-closed Bearer auth, aggregates-only response, and
// per-definition error isolation. The engine and definitions are mocked; the route itself
// must never send, mark or write anything (it only calls evaluateDefinition, which these
// tests replace).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ serviceClient: {} }));
vi.mock("@/lib/email-campaigns/lifecycle/engine", () => ({
  evaluateDefinition: vi.fn(),
}));
vi.mock("@/lib/email-campaigns/lifecycle/definitions", () => ({
  LIFECYCLE_DEFINITIONS: [
    { key: "alpha", status: "draft", audienceKey: "new_signups" },
    { key: "beta", status: "active", audienceKey: "inactive_day_14" },
  ],
}));

import { POST } from "@/app/api/internal/lifecycle-dry-run/route";
import { evaluateDefinition } from "@/lib/email-campaigns/lifecycle/engine";

const SECRET = "test-dispatch-secret";

function request(auth?: string): Request {
  return new Request("http://localhost/api/internal/lifecycle-dry-run", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

describe("POST /api/internal/lifecycle-dry-run", () => {
  beforeEach(() => {
    process.env.CT_DISPATCH_SECRET = SECRET;
    vi.mocked(evaluateDefinition).mockReset();
  });
  afterEach(() => {
    delete process.env.CT_DISPATCH_SECRET;
  });

  it("fails closed with 500 while the secret is unset", async () => {
    delete process.env.CT_DISPATCH_SECRET;
    const res = await POST(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(evaluateDefinition).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer with 401 and evaluates nothing", async () => {
    const res = await POST(request("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(evaluateDefinition).not.toHaveBeenCalled();
  });

  it("evaluates every definition (drafts included) and returns aggregates only", async () => {
    vi.mocked(evaluateDefinition).mockResolvedValue({
      audienceSize: 12,
      eligible: [
        { artistId: "a1", email: "a@x.com", slug: "a", displayName: "A" },
        { artistId: "a2", email: "b@x.com", slug: "b", displayName: "B" },
      ],
      skipped: {
        no_email: 1,
        suppressed: 2,
        opted_out: 3,
        throttled: 4,
        already_sent: 0,
        capped: 0,
      },
    });
    const res = await POST(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      definitions: Record<string, unknown>[];
    };
    expect(body.definitions).toHaveLength(2);
    expect(body.definitions[0]).toEqual({
      key: "alpha",
      status: "draft",
      audienceSize: 12,
      eligible: 2,
      skipped: {
        no_email: 1,
        suppressed: 2,
        opted_out: 3,
        throttled: 4,
        already_sent: 0,
        capped: 0,
      },
      error: null,
    });
    // aggregates only: no artist id, email or display name may leak
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("a@x.com");
    expect(raw).not.toContain("a1");
    expect(evaluateDefinition).toHaveBeenCalledTimes(2);
  });

  it("isolates a failing definition instead of failing the whole response", async () => {
    vi.mocked(evaluateDefinition)
      .mockRejectedValueOnce(new Error("segment exploded"))
      .mockResolvedValueOnce({
        audienceSize: 3,
        eligible: [],
        skipped: {
          no_email: 0,
          suppressed: 0,
          opted_out: 3,
          throttled: 0,
          already_sent: 0,
          capped: 0,
        },
      });
    const res = await POST(request(`Bearer ${SECRET}`));
    const body = (await res.json()) as {
      definitions: {
        key: string;
        error: string | null;
        eligible: number | null;
      }[];
    };
    expect(body.definitions[0]).toMatchObject({
      key: "alpha",
      error: "evaluation failed",
      eligible: null,
    });
    expect(body.definitions[1]).toMatchObject({
      key: "beta",
      error: null,
      eligible: 0,
    });
    // the generic message never leaks internals
    expect(JSON.stringify(body)).not.toContain("segment exploded");
  });
});
