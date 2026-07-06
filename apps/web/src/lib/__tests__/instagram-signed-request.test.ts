import crypto from "crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseSignedRequest } from "@/lib/instagram";

const SECRET = "test-instagram-secret";
const META_SECRET = "test-meta-secret";

function sign(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${sig}.${encoded}`;
}

const PAYLOAD = {
  user_id: "17841400000000000",
  algorithm: "HMAC-SHA256",
  issued_at: 1751760000,
};

describe("parseSignedRequest", () => {
  beforeEach(() => {
    vi.stubEnv("INSTAGRAM_APP_SECRET", SECRET);
    vi.stubEnv("META_APP_SECRET", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a request signed with the Instagram app secret", () => {
    expect(parseSignedRequest(sign(PAYLOAD, SECRET))).toMatchObject({
      user_id: PAYLOAD.user_id,
    });
  });

  it("accepts a request signed with the Meta app secret when configured", () => {
    vi.stubEnv("META_APP_SECRET", META_SECRET);
    expect(parseSignedRequest(sign(PAYLOAD, META_SECRET))).toMatchObject({
      user_id: PAYLOAD.user_id,
    });
  });

  it("rejects a request signed with an unknown secret", () => {
    expect(parseSignedRequest(sign(PAYLOAD, "wrong-secret"))).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const valid = sign(PAYLOAD, SECRET);
    const [sig] = valid.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...PAYLOAD, user_id: "999" }),
    ).toString("base64url");
    expect(parseSignedRequest(`${sig}.${forged}`)).toBeNull();
  });

  it("rejects an unexpected algorithm", () => {
    expect(
      parseSignedRequest(sign({ ...PAYLOAD, algorithm: "HMAC-MD5" }, SECRET)),
    ).toBeNull();
  });

  it("coerces a safe-integer numeric user_id to a string", () => {
    const result = parseSignedRequest(
      sign({ ...PAYLOAD, user_id: 218471 }, SECRET),
    );
    expect(result?.user_id).toBe("218471");
  });

  it("fails closed on a numeric user_id above 2^53 (precision already lost)", () => {
    // Build the JSON by hand so the 17-digit number reaches JSON.parse as a
    // number literal (JSON.stringify of a JS number would pre-round it).
    const encoded = Buffer.from(
      '{"user_id":17841400000000001,"algorithm":"HMAC-SHA256"}',
    ).toString("base64url");
    const sig = crypto
      .createHmac("sha256", SECRET)
      .update(encoded)
      .digest("base64url");
    expect(parseSignedRequest(`${sig}.${encoded}`)).toBeNull();
  });

  it("fails closed on a non-string non-number user_id", () => {
    expect(
      parseSignedRequest(sign({ ...PAYLOAD, user_id: { $gt: "" } }, SECRET)),
    ).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseSignedRequest("")).toBeNull();
    expect(parseSignedRequest("no-dot")).toBeNull();
    expect(parseSignedRequest("garbage.garbage")).toBeNull();
    expect(parseSignedRequest(".")).toBeNull();
  });

  it("rejects everything when no secret is configured", () => {
    vi.stubEnv("INSTAGRAM_APP_SECRET", "");
    expect(parseSignedRequest(sign(PAYLOAD, SECRET))).toBeNull();
  });
});
