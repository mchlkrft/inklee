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
  if (sig !== expected) return null;
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
