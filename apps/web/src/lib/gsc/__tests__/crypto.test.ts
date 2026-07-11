// AES-256-GCM refresh-token encryption at rest: round trip, IV randomness and
// tamper detection via the GCM auth tag. crypto.ts imports "server-only",
// which vitest.config.ts aliases to a no-op module; the key derives lazily
// from env on each call, so vi.stubEnv works without module re-imports.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "../crypto";

const SECRET = "unit-test-secret-0123456789abcdef";

beforeEach(() => {
  vi.stubEnv("GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a refresh token", () => {
    const plaintext = "1//refresh-token-value-with-symbols_.~";
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-refresh-token";
    const first = encryptToken(plaintext);
    const second = encryptToken(plaintext);
    expect(first).not.toBe(second);
    // Both still decrypt to the original value.
    expect(decryptToken(first)).toBe(plaintext);
    expect(decryptToken(second)).toBe(plaintext);
  });

  it("rejects a tampered ciphertext payload", () => {
    const [iv, tag, data] = encryptToken("refresh-token-value").split(":");
    const flipped = (data[0] === "A" ? "B" : "A") + data.slice(1);
    expect(() => decryptToken(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const [iv, tag, data] = encryptToken("refresh-token-value").split(":");
    const flipped = (tag[0] === "A" ? "B" : "A") + tag.slice(1);
    expect(() => decryptToken(`${iv}:${flipped}:${data}`)).toThrow();
  });

  it("rejects a malformed ciphertext", () => {
    expect(() => decryptToken("not-a-valid-ciphertext")).toThrow(/Malformed/);
  });

  it("refuses to run without a configured secret", () => {
    vi.stubEnv("GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET", "");
    expect(() => encryptToken("anything")).toThrow(/not configured/);
  });

  it("refuses a secret shorter than 16 characters", () => {
    vi.stubEnv("GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET", "short");
    expect(() => encryptToken("anything")).toThrow(/not configured/);
  });
});
