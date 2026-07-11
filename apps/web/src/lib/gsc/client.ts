/**
 * Minimal Google Search Console REST client (no SDK dependency): OAuth token
 * exchange/refresh + site listing + Search Analytics queries with pagination
 * and bounded retries. Tokens never leave the server; callers hold access
 * tokens only for the duration of a sync run.
 */

import "server-only";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API_BASE = "https://www.googleapis.com/webmasters/v3";

export const GSC_MAX_ROWS = 25_000;

function clientCredentials(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI ??
    "https://inklee.app/api/admin/gsc/callback";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google Search Console OAuth credentials are not configured.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function isGscConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID &&
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET &&
    process.env.GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET,
  );
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = clientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GSC_SCOPE,
    access_type: "offline",
    prompt: "consent", // guarantees a refresh token on reconnect
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  scope: string;
}> {
  const { clientId, clientSecret, redirectUri } = clientCredentials();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(
      `Token exchange failed: ${String(data.error ?? response.status)}`,
    );
  }
  if (typeof data.refresh_token !== "string") {
    throw new Error(
      "Google did not return a refresh token. Remove the app's access at myaccount.google.com/permissions and reconnect.",
    );
  }
  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresIn: Number(data.expires_in ?? 3600),
    scope: String(data.scope ?? ""),
  };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<string> {
  const { clientId, clientSecret } = clientCredentials();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== "string") {
    const code = String((data.error as string) ?? response.status);
    const err = new Error(`Token refresh failed: ${code}`);
    (err as Error & { authExpired?: boolean }).authExpired =
      code === "invalid_grant";
    throw err;
  }
  return data.access_token;
}

export type GscSite = { siteUrl: string; permissionLevel: string };

export async function listSites(accessToken: string): Promise<GscSite[]> {
  const response = await fetch(`${API_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Site listing failed: ${response.status}`);
  const data = (await response.json()) as {
    siteEntry?: { siteUrl: string; permissionLevel: string }[];
  };
  return (data.siteEntry ?? []).map((entry) => ({
    siteUrl: entry.siteUrl,
    permissionLevel: entry.permissionLevel,
  }));
}

export type GscRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

async function withRetries<T>(run: () => Promise<T>): Promise<T> {
  let delay = 1_000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const message = (err as Error).message;
      const transient =
        /429|500|502|503|504|fetch failed|ETIMEDOUT|ECONNRESET/.test(message);
      if (!transient || attempt >= 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/** One Search Analytics query, fully paginated (25k rows per request,
 *  increasing startRow until the API returns no rows). */
export async function querySearchAnalytics(options: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  searchType?: string;
}): Promise<GscRow[]> {
  const rows: GscRow[] = [];
  for (let startRow = 0; ; startRow += GSC_MAX_ROWS) {
    const page = await withRetries(async () => {
      const response = await fetch(
        `${API_BASE}/sites/${encodeURIComponent(options.siteUrl)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            startDate: options.startDate,
            endDate: options.endDate,
            dimensions: options.dimensions,
            searchType: options.searchType ?? "web",
            rowLimit: GSC_MAX_ROWS,
            startRow,
            dataState: "final",
          }),
        },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Search analytics query failed: ${response.status} ${body.slice(0, 200)}`,
        );
      }
      return (await response.json()) as { rows?: GscRow[] };
    });
    const pageRows = page.rows ?? [];
    rows.push(...pageRows);
    if (pageRows.length < GSC_MAX_ROWS) break;
    if (startRow > 500_000) break; // hard safety stop
  }
  return rows;
}
