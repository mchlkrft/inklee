import { describe, it, expect, vi, beforeEach } from "vitest";

// CRON-IGX-001: the route used to mark `connected: false` on ANY thrown
// error from refreshLongLivedToken — a 429, a Meta 5xx outage, or a network
// fault — with a comment asserting "token is dead" where nothing established
// that. Recovery was then impossible because the accounts query filters on
// `connected = true`. Same shape as PAY-CONN-001 (cached Connect state lying
// on a broad error class): the fix requires the error to actually NAME the
// failure as an invalid token (Meta code 190) before touching `connected`.
//
// `refreshLongLivedToken` itself is mocked — its own HTTP behaviour is
// exercised by lib/instagram's own tests. What lives ONLY in the route is the
// disconnect DECISION made from whatever that function throws.

const { mockRefresh, mockCaptureException } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
}));
vi.mock("@/lib/instagram", () => ({
  refreshLongLivedToken: (...a: unknown[]) => mockRefresh(...a),
}));

type Account = { artist_id: string; access_token: string };
type UpdateCall = { payload: Record<string, unknown>; artistId: string };

let accountsToReturn: Account[] = [];
let accountsFetchError: { message: string } | null = null;
const updateCalls: UpdateCall[] = [];

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => {
      if (table !== "instagram_accounts") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            lt: () =>
              Promise.resolve({
                data: accountsToReturn,
                error: accountsFetchError,
              }),
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: (_col: string, artistId: string) => {
            updateCalls.push({ payload, artistId });
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  },
}));

import { GET } from "../route";

function metaError(code: number, message: string): Error {
  return new Error(
    `Token refresh failed: ${JSON.stringify({ error: { message, type: "OAuthException", code } })}`,
  );
}

function req(withSecret = true) {
  return new Request("https://inkl.ee/api/cron/instagram-refresh", {
    headers: withSecret ? { authorization: "Bearer test-secret" } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  accountsToReturn = [];
  accountsFetchError = null;
  updateCalls.length = 0;
  process.env.CRON_SECRET = "test-secret";
});

describe("instagram-refresh disconnect discrimination (CRON-IGX-001)", () => {
  it("rejects a request without the cron secret", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("a successful refresh stores the new token and never touches `connected`", async () => {
    accountsToReturn = [{ artist_id: "artist-ok", access_token: "old" }];
    mockRefresh.mockResolvedValue({
      access_token: "new-token",
      expires_in: 5184000,
    });

    const res = await GET(req());
    expect(await res.json()).toEqual({ refreshed: 1, failed: 0 });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).not.toHaveProperty("connected");
    expect(updateCalls[0].payload).toMatchObject({
      access_token: "new-token",
    });
  });

  it("a Meta code-190 (invalid access token) error marks the account disconnected", async () => {
    accountsToReturn = [{ artist_id: "artist-dead", access_token: "tok" }];
    mockRefresh.mockRejectedValue(
      metaError(190, "Error validating access token"),
    );

    const res = await GET(req());
    expect(await res.json()).toEqual({ refreshed: 0, failed: 1 });
    expect(updateCalls).toEqual([
      {
        payload: expect.objectContaining({ connected: false }),
        artistId: "artist-dead",
      },
    ]);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("a 429 rate-limit error (OAuthException, code 4 not 190) leaves the account connected", async () => {
    accountsToReturn = [{ artist_id: "artist-limited", access_token: "tok" }];
    mockRefresh.mockRejectedValue(
      metaError(4, "Application request limit reached"),
    );

    const res = await GET(req());
    expect(await res.json()).toEqual({ refreshed: 0, failed: 1 });
    // Fails if the route reverts to marking disconnected on ANY thrown error:
    // a platform-wide Meta rate limit or outage would disconnect every
    // account due for refresh in the same run, with no way back short of the
    // artist re-running OAuth (the query filters on connected=true).
    expect(updateCalls).toEqual([]);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("a network failure that never reached Meta (no HTTP response at all) leaves the account connected", async () => {
    accountsToReturn = [{ artist_id: "artist-network", access_token: "tok" }];
    // A bare fetch() rejection has no "Token refresh failed:" prefix — that
    // prefix is only added once a response was actually received.
    mockRefresh.mockRejectedValue(new TypeError("fetch failed"));

    const res = await GET(req());
    expect(await res.json()).toEqual({ refreshed: 0, failed: 1 });
    expect(updateCalls).toEqual([]);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("an unparseable (non-JSON) error body is not treated as evidence of a dead token", async () => {
    accountsToReturn = [{ artist_id: "artist-html", access_token: "tok" }];
    mockRefresh.mockRejectedValue(
      new Error("Token refresh failed: <html>502 Bad Gateway</html>"),
    );

    const res = await GET(req());
    expect(await res.json()).toEqual({ refreshed: 0, failed: 1 });
    expect(updateCalls).toEqual([]);
  });

  it("propagates the accounts-fetch error as a 500 and reports it to Sentry", async () => {
    accountsFetchError = { message: "connection reset" };

    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
