import { describe, it, expect } from "vitest";
import { sanitizeHttpUrl } from "@inklee/shared/url";

describe("sanitizeHttpUrl", () => {
  it("accepts and normalizes http(s) urls", () => {
    expect(sanitizeHttpUrl("https://example.com/ref")).toBe(
      "https://example.com/ref",
    );
    expect(sanitizeHttpUrl("http://example.com")).toBe("http://example.com/");
    expect(sanitizeHttpUrl("  https://example.com/x  ")).toBe(
      "https://example.com/x",
    );
  });

  it("rejects unsafe and non-http schemes", () => {
    expect(sanitizeHttpUrl("javascript:alert(document.domain)")).toBeNull();
    expect(sanitizeHttpUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(sanitizeHttpUrl("mailto:a@b.com")).toBeNull();
    expect(sanitizeHttpUrl("tel:+123")).toBeNull();
    expect(sanitizeHttpUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects protocol-relative, junk, and non-strings", () => {
    expect(sanitizeHttpUrl("//evil.com")).toBeNull();
    expect(sanitizeHttpUrl("/relative/path")).toBeNull();
    expect(sanitizeHttpUrl("not a url")).toBeNull();
    expect(sanitizeHttpUrl("")).toBeNull();
    expect(sanitizeHttpUrl("   ")).toBeNull();
    expect(sanitizeHttpUrl(null)).toBeNull();
    expect(sanitizeHttpUrl(undefined)).toBeNull();
    expect(sanitizeHttpUrl(42)).toBeNull();
  });
});
