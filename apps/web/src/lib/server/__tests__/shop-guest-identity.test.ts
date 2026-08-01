import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// FD5 guest buyer identity. The whole point of this module is: reuse an
// existing cookie's identity across mutations rather than forking a new one
// every time, and never expose the raw token anywhere a hash would do.

const { mockCookieStore } = vi.hoisted(() => ({
  mockCookieStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => mockCookieStore,
}));

import {
  SHOP_GUEST_COOKIE,
  hashGuestToken,
  readGuestTokenHash,
  getOrCreateGuestTokenHash,
} from "@/lib/server/shop-guest-identity";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hashGuestToken", () => {
  it("is a deterministic SHA-256 hex digest", () => {
    const hash = hashGuestToken("abc123");
    expect(hash).toBe(
      crypto.createHash("sha256").update("abc123").digest("hex"),
    );
    expect(hashGuestToken("abc123")).toBe(hash); // deterministic
  });

  it("different tokens hash to different values", () => {
    expect(hashGuestToken("token-a")).not.toBe(hashGuestToken("token-b"));
  });
});

describe("readGuestTokenHash (read-only, Server Component safe)", () => {
  it("returns null for a first-time visitor with no cookie — never an error", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const hash = await readGuestTokenHash();
    expect(hash).toBeNull();
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("returns the hash of an existing cookie without minting a new one", async () => {
    mockCookieStore.get.mockReturnValue({ value: "existing-raw-token" });
    const hash = await readGuestTokenHash();
    expect(hash).toBe(hashGuestToken("existing-raw-token"));
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });
});

describe("getOrCreateGuestTokenHash (Server Action, can set cookies)", () => {
  it("reuses an existing identity rather than forking a new one", async () => {
    mockCookieStore.get.mockReturnValue({ value: "existing-raw-token" });
    const hash = await getOrCreateGuestTokenHash();
    expect(hash).toBe(hashGuestToken("existing-raw-token"));
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("mints a new httpOnly token and sets it when no cookie exists yet", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const hash = await getOrCreateGuestTokenHash();
    expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
    const [name, rawToken, options] = mockCookieStore.set.mock.calls[0];
    expect(name).toBe(SHOP_GUEST_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax" });
    // The returned hash matches a hash of the EXACT raw value the cookie was
    // set to — the two must never diverge, or a later read would fail to
    // find the cart/wishlist rows this call just wrote.
    expect(hash).toBe(hashGuestToken(rawToken));
  });

  it("two mints never collide (a real random token each time)", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const first = await getOrCreateGuestTokenHash();
    mockCookieStore.get.mockReturnValue(undefined);
    const second = await getOrCreateGuestTokenHash();
    expect(first).not.toBe(second);
  });
});
