/**
 * AES-256-GCM encryption for the Google refresh token at rest. Standard Node
 * crypto (no custom scheme): random 12-byte IV per encryption, auth tag
 * verified on decrypt. The key derives from
 * GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET (server-only env).
 */

import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function key(): Buffer {
  const secret = process.env.GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET is not configured.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptToken(ciphertext: string): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(":");
  if (!ivB64 || !tagB64 || !dataB64)
    throw new Error("Malformed token ciphertext.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
