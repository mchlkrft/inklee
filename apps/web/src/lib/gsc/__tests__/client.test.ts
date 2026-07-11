// Google Search Console REST client: pagination, retry behaviour, OAuth URL
// construction and the missing-refresh-token guard. All network access is a
// stubbed global fetch; no request ever leaves the test. client.ts imports
// "server-only", which vitest.config.ts aliases to a no-op module.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GSC_MAX_ROWS,
  GSC_SCOPE,
  buildAuthUrl,
  exchangeCode,
  querySearchAnalytics,
} from "../client";

type FetchInit = { method?: string; body?: string };

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    keys: [`query-${i}`],
    clicks: 1,
    impressions: 2,
    ctr: 0.5,
    position: 3.2,
  }));
}

const QUERY_OPTIONS = {
  accessToken: "test-access-token",
  siteUrl: "sc-domain:inklee.app",
  startDate: "2026-07-01",
  endDate: "2026-07-01",
  dimensions: ["query"],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GOOGLE_SEARCH_CONSOLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv(
    "GOOGLE_SEARCH_CONSOLE_REDIRECT_URI",
    "https://example.test/api/admin/gsc/callback",
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("querySearchAnalytics", () => {
  it("uses the documented 25k page size", () => {
    expect(GSC_MAX_ROWS).toBe(25_000);
  });

  it("paginates when a page comes back full, advancing startRow", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ rows: makeRows(GSC_MAX_ROWS) }))
      .mockResolvedValueOnce(jsonResponse({ rows: makeRows(100) }));

    const rows = await querySearchAnalytics(QUERY_OPTIONS);

    expect(rows).toHaveLength(GSC_MAX_ROWS + 100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const startRows = fetchMock.mock.calls.map((call) => {
      const init = call[1] as FetchInit | undefined;
      return JSON.parse(init?.body ?? "{}").startRow;
    });
    expect(startRows).toEqual([0, GSC_MAX_ROWS]);
    // The site URL is encoded into the endpoint path.
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      encodeURIComponent("sc-domain:inklee.app"),
    );
  });

  it("stops after a single request when the API returns no rows", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [] }));

    const rows = await querySearchAnalytics(QUERY_OPTIONS);

    expect(rows).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a missing rows key as an empty page", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    const rows = await querySearchAnalytics(QUERY_OPTIONS);

    expect(rows).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 503 and eventually succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "backendError" }, 503))
      .mockResolvedValueOnce(jsonResponse({ rows: makeRows(3) }));

    const promise = querySearchAnalytics(QUERY_OPTIONS);
    // The first attempt fails and schedules a 1s backoff; advancing the fake
    // clock (flushing microtasks along the way) lets the retry run.
    await vi.advanceTimersByTimeAsync(1_000);
    const rows = await promise;

    expect(rows).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "forbidden" }, 403));

    await expect(querySearchAnalytics(QUERY_OPTIONS)).rejects.toThrow(/403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("buildAuthUrl", () => {
  it("requests the readonly scope with offline access and carries the state", () => {
    const url = new URL(buildAuthUrl("csrf-state-123"));

    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("scope")).toBe(GSC_SCOPE);
    expect(GSC_SCOPE).toBe(
      "https://www.googleapis.com/auth/webmasters.readonly",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("csrf-state-123");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.test/api/admin/gsc/callback",
    );
    // prompt=consent guarantees a refresh token on reconnect.
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
});

describe("exchangeCode", () => {
  it("throws a helpful error when Google omits the refresh token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "at", expires_in: 3600, scope: GSC_SCOPE }),
    );

    await expect(exchangeCode("auth-code")).rejects.toThrow(
      /did not return a refresh token/,
    );
  });

  it("returns the token bundle when the exchange succeeds", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3599,
        scope: GSC_SCOPE,
      }),
    );

    await expect(exchangeCode("auth-code")).resolves.toEqual({
      accessToken: "at",
      refreshToken: "rt",
      expiresIn: 3599,
      scope: GSC_SCOPE,
    });
  });
});
