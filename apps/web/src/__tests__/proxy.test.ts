import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// MFA-GATE-001: apps/web/src/proxy.ts is the LIVE edge gate for every artist
// path (/dashboard, /bookings, /settings, /admin, ...). It used to fail OPEN
// two ways when getAuthenticatorAssuranceLevel() failed — a thrown error was
// caught and swallowed, and a non-throwing {data:null, error} result left
// `aal?.nextLevel` undefined so the redirect condition was simply false. Both
// let an un-stepped-up AAL1 session reach every gated page with zero signal.
// This suite drives the real `proxy()` export end-to-end (real resolveMfaStepUp,
// real host routing) against a mocked Supabase client, so it proves the actual
// wiring and not just the extracted helper (see lib/__tests__/mfa-step-up.test.ts
// for the helper's own unit coverage).

const { mockCreateServerClient, mockCaptureMessage, mockCaptureException } =
  vi.hoisted(() => ({
    mockCreateServerClient: vi.fn(),
    mockCaptureMessage: vi.fn(),
    mockCaptureException: vi.fn(),
  }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  captureException: (...a: unknown[]) => mockCaptureException(...a),
}));

import { proxy } from "../proxy";

type AalFn = () => Promise<{ data: unknown; error: unknown }>;

const USER = { id: "user-1" };
const ACTIVE_PROFILE = { slug: "artist-1", account_status: "active" };

function makeSupabase(opts: {
  user?: { id: string } | null;
  aal: AalFn;
  profile?: { slug: string; account_status: string } | null;
}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: opts.user ?? null } })),
      mfa: { getAuthenticatorAssuranceLevel: opts.aal },
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: opts.profile ?? null,
            error: null,
          })),
        })),
      })),
    })),
  };
}

function dashboardRequest(pathname = "/dashboard") {
  return new NextRequest(`https://inklee.app${pathname}`, {
    headers: { host: "inklee.app" },
  });
}

beforeEach(() => {
  mockCreateServerClient.mockReset();
  mockCaptureMessage.mockReset();
  mockCaptureException.mockReset();
});

describe("proxy() MFA step-up gate (MFA-GATE-001)", () => {
  it("fail-open path 1 CLOSED: a thrown AAL check redirects to /auth/mfa and logs to Sentry", async () => {
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        user: USER,
        profile: ACTIVE_PROFILE,
        aal: vi.fn().mockRejectedValue(new Error("network blip")),
      }),
    );

    const res = await proxy(dashboardRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://inklee.app/auth/mfa");
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      "mfa_step_up_check_failed",
      expect.objectContaining({ level: "error" }),
    );
    // Mutation: restore the old try/catch-and-continue around a raw
    // getAuthenticatorAssuranceLevel() call — this test fails because the
    // response would be NextResponse.next() (no Location header) instead of
    // a redirect, and Sentry would never be called.
  });

  it("fail-open path 2 CLOSED: a non-throwing {data:null, error} AAL result also redirects to /auth/mfa", async () => {
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        user: USER,
        profile: ACTIVE_PROFILE,
        aal: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: "boom" } }),
      }),
    );

    const res = await proxy(dashboardRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://inklee.app/auth/mfa");
    expect(mockCaptureMessage).toHaveBeenCalled();
    // Mutation: restore the old `if (aal?.nextLevel === "aal2" && ...)` read
    // straight off the destructured `data` — this test fails because
    // `aal?.nextLevel` is undefined on a null `data`, the condition is false,
    // and the request falls through to NextResponse.next() with no redirect.
  });

  it("DISTINCTION: a user with no TOTP enrolled reaches the dashboard normally (no gate, no Sentry noise)", async () => {
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        user: USER,
        profile: ACTIVE_PROFILE,
        aal: vi.fn().mockResolvedValue({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        }),
      }),
    );

    const res = await proxy(dashboardRequest());

    expect(res.headers.get("location")).toBeNull();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    // Mutation: fail closed unconditionally (redirect to /auth/mfa whenever
    // nextLevel !== "aal2", instead of only when currentLevel is also "aal1")
    // — this test fails because the majority of users (no factor enrolled)
    // would be redirected to a page they can never complete.
  });

  it("DISTINCTION: an enrolled, already-stepped-up (aal2) session is not re-challenged", async () => {
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        user: USER,
        profile: ACTIVE_PROFILE,
        aal: vi.fn().mockResolvedValue({
          data: { currentLevel: "aal2", nextLevel: "aal2" },
          error: null,
        }),
      }),
    );

    const res = await proxy(dashboardRequest());

    expect(res.headers.get("location")).toBeNull();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("regression: enrolled-but-not-stepped-up (aal1 -> aal2) still redirects to /auth/mfa, without Sentry noise", async () => {
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        user: USER,
        profile: ACTIVE_PROFILE,
        aal: vi.fn().mockResolvedValue({
          data: { currentLevel: "aal1", nextLevel: "aal2" },
          error: null,
        }),
      }),
    );

    const res = await proxy(dashboardRequest());

    expect(res.headers.get("location")).toBe("https://inklee.app/auth/mfa");
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("a single transient blip is absorbed by the retry without failing closed or emitting Sentry noise", async () => {
    const aal = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        data: { currentLevel: "aal1", nextLevel: "aal1" },
        error: null,
      });
    mockCreateServerClient.mockReturnValue(
      makeSupabase({ user: USER, profile: ACTIVE_PROFILE, aal }),
    );

    const res = await proxy(dashboardRequest());

    expect(aal).toHaveBeenCalledTimes(2);
    expect(res.headers.get("location")).toBeNull();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("no redirect loop: requesting /auth/mfa never redirects back to itself, even mid-outage", async () => {
    // /auth/mfa does not match any ARTIST_PATHS prefix, so it never enters
    // this gate at all — confirming the fail-closed redirect target the two
    // fail-open tests above land on cannot bounce the browser back to itself
    // even while the AAL check keeps failing.
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        user: USER,
        profile: ACTIVE_PROFILE,
        aal: vi.fn().mockRejectedValue(new Error("still down")),
      }),
    );

    const res = await proxy(dashboardRequest("/auth/mfa"));

    expect(res.headers.get("location")).toBeNull();
  });
});
