import crypto from "crypto";

// ─── Types ─────────────────────────────────────────────────────────────────

export type InstagramMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

export interface InstagramMediaItem {
  id: string;
  media_type: InstagramMediaType;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  caption?: string;
  timestamp?: string;
}

export interface InstagramTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  /** App-scoped user id — the id Meta's deauthorize/data-deletion callbacks
   * reference, which can differ from the professional-account IGID that /me
   * returns. */
  user_id?: number | string;
}

export interface InstagramLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
}

export interface InstagramUserResponse {
  id: string;
  username: string;
}

// ─── Configuration helpers ──────────────────────────────────────────────────

export function isInstagramConfigured(): boolean {
  return !!(
    process.env.INSTAGRAM_APP_ID &&
    process.env.INSTAGRAM_APP_SECRET &&
    (process.env.INSTAGRAM_STATE_SECRET || process.env.CRON_SECRET)
  );
}

export function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  return `${base}/api/instagram/callback`;
}

function getStateSecret(): string {
  const secret =
    process.env.INSTAGRAM_STATE_SECRET ?? process.env.CRON_SECRET ?? null;
  if (!secret) {
    throw new Error("instagram oauth state secret is not configured");
  }
  return secret;
}

// ─── State parameter (stateless HMAC — no DB storage needed) ───────────────

export function generateOAuthState(artistId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      artistId,
      nonce: crypto.randomBytes(8).toString("hex"),
      ts: Date.now(),
    }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string): string | null {
  const dot = state.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("hex");
  // AUTH-01: constant-time compare (the previous `!==` leaked timing).
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return null;
  }
  try {
    const { artistId, ts } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    // Reject states older than 15 minutes
    if (Date.now() - (ts as number) > 15 * 60 * 1000) return null;
    return artistId as string;
  } catch {
    return null;
  }
}

// ─── OAuth URL ──────────────────────────────────────────────────────────────

export function buildOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "instagram_business_basic",
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

// ─── API calls (server-side only) ──────────────────────────────────────────

export async function exchangeCodeForToken(
  code: string,
): Promise<InstagramTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(),
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json() as Promise<InstagramTokenResponse>;
}

export async function exchangeForLongLivedToken(
  shortToken: string,
): Promise<InstagramLongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    access_token: shortToken,
  });
  const res = await fetch(`https://graph.instagram.com/access_token?${params}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Long-lived token exchange failed: ${err}`);
  }
  return res.json() as Promise<InstagramLongLivedTokenResponse>;
}

export async function refreshLongLivedToken(
  token: string,
): Promise<InstagramLongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: token,
  });
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?${params}`,
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return res.json() as Promise<InstagramLongLivedTokenResponse>;
}

export async function fetchInstagramUser(
  token: string,
): Promise<InstagramUserResponse> {
  const params = new URLSearchParams({
    fields: "id,username",
    access_token: token,
  });
  const res = await fetch(`https://graph.instagram.com/me?${params}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`User fetch failed: ${err}`);
  }
  return res.json() as Promise<InstagramUserResponse>;
}

export async function fetchInstagramMedia(
  token: string,
  limit = 50,
): Promise<InstagramMediaItem[]> {
  const params = new URLSearchParams({
    fields: "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp",
    limit: String(limit),
    access_token: token,
  });
  const res = await fetch(`https://graph.instagram.com/me/media?${params}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Media fetch failed: ${err}`);
  }
  const json = (await res.json()) as { data?: InstagramMediaItem[] };
  return json.data ?? [];
}

// ─── Meta signed_request (deauthorize + data-deletion callbacks) ────────────

export interface MetaSignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
}

/**
 * Verify + decode the `signed_request` Meta POSTs to the deauthorize and
 * data-deletion callbacks: `base64url(rawHmacSig).base64url(json)`, keyed with
 * the app secret. Meta's docs are ambiguous about whether Instagram-Login apps
 * are signed with the Instagram app secret or the parent Meta app secret, so
 * this accepts either (META_APP_SECRET is optional and currently unset).
 * Returns null on any mismatch or malformed input.
 */
export function parseSignedRequest(
  signedRequest: string,
): MetaSignedRequestPayload | null {
  const dot = signedRequest.indexOf(".");
  if (dot === -1) return null;
  const encodedSig = signedRequest.slice(0, dot);
  const payload = signedRequest.slice(dot + 1);

  const secrets = [
    { name: "INSTAGRAM_APP_SECRET", secret: process.env.INSTAGRAM_APP_SECRET },
    { name: "META_APP_SECRET", secret: process.env.META_APP_SECRET },
  ].filter((s): s is { name: string; secret: string } => !!s.secret);
  if (secrets.length === 0) return null;

  const sig = Buffer.from(encodedSig, "base64url");
  const verifiedWith = secrets.find(({ secret }) => {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest();
    return (
      sig.length === expected.length && crypto.timingSafeEqual(sig, expected)
    );
  });
  if (!verifiedWith) return null;
  if (verifiedWith.name !== "INSTAGRAM_APP_SECRET") {
    // Meta never documents which secret signs Instagram-Login callbacks; log
    // when the fallback matched so the ambiguity can be tightened later.
    console.warn(
      `[instagram] signed_request verified with the fallback ${verifiedWith.name}`,
    );
  }

  try {
    const raw = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (
      typeof raw.algorithm === "string" &&
      raw.algorithm.toUpperCase() !== "HMAC-SHA256"
    ) {
      return null;
    }
    // Normalize user_id at the boundary: Meta documents a string, but the
    // platform's own token endpoint returns ids as JSON numbers. Accept a
    // safe-integer number; fail closed on anything else — an unsafe-integer
    // number has already lost digits in JSON.parse, and passing it on would
    // silently no-op the teardown lookup while still confirming deletion.
    let userId: string | undefined;
    if (typeof raw.user_id === "string" && raw.user_id.length > 0) {
      userId = raw.user_id;
    } else if (
      typeof raw.user_id === "number" &&
      Number.isSafeInteger(raw.user_id)
    ) {
      userId = String(raw.user_id);
    } else if (raw.user_id != null) {
      return null;
    }
    return {
      user_id: userId,
      algorithm: typeof raw.algorithm === "string" ? raw.algorithm : undefined,
      issued_at: typeof raw.issued_at === "number" ? raw.issued_at : undefined,
    };
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract a usable thumbnail URL from a media item */
export function getMediaPreviewUrl(item: InstagramMediaItem): string | null {
  if (item.media_type === "VIDEO") return item.thumbnail_url ?? null;
  return item.media_url ?? null;
}

/** Derive a flash item title from an Instagram caption */
export function titleFromCaption(caption: string | null | undefined): string {
  if (!caption?.trim()) return "";
  // First line, strip hashtags/mentions, limit length
  const firstLine = caption
    .split("\n")[0]
    .replace(/#\w+|@\w+/g, "")
    .trim();
  return firstLine.slice(0, 60).trim();
}
