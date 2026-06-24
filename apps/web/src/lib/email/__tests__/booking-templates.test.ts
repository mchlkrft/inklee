import { describe, it, expect } from "vitest";
import { sanitizeHrefForEmail } from "../booking-templates";
import { renderEmailShell } from "../layout";

describe("sanitizeHrefForEmail", () => {
  it("accepts plain http/https URLs and HTML-escapes the result", () => {
    expect(sanitizeHrefForEmail("https://maps.example.com/")).toBe(
      "https://maps.example.com/",
    );
    expect(sanitizeHrefForEmail("http://maps.example.com/")).toBe(
      "http://maps.example.com/",
    );
  });

  it("escapes characters that would break out of the href attribute", () => {
    // The URL constructor canonicalises a stray double-quote into %22, but
    // ampersands survive and must be escaped for the HTML attribute.
    expect(sanitizeHrefForEmail("https://example.com/?q=a&b=c")).toBe(
      "https://example.com/?q=a&amp;b=c",
    );
  });

  it("rejects javascript: and data: schemes", () => {
    expect(sanitizeHrefForEmail("javascript:alert(1)")).toBeNull();
    expect(
      sanitizeHrefForEmail("data:text/html,<script>1</script>"),
    ).toBeNull();
    expect(sanitizeHrefForEmail("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects unparseable strings", () => {
    expect(sanitizeHrefForEmail("not a url")).toBeNull();
    expect(sanitizeHrefForEmail("")).toBeNull();
    expect(sanitizeHrefForEmail("/relative/path")).toBeNull();
  });
});

describe("renderEmailShell footer escaping (INJ-02)", () => {
  it("escapes HTML in a caller-provided footer note (untrusted artist name)", () => {
    const html = renderEmailShell({
      contentHtml: "<p>body</p>",
      footerNote: 'Sent by <img src=x onerror="alert(1)"> Studio',
    });
    // The shell has a logo <img>, so target the injected footer specifically:
    // the angle brackets are escaped and the onerror handler never lands raw.
    expect(html).toContain("&lt;img");
    expect(html).not.toContain('onerror="alert(1)"');
  });

  it("leaves the default tagline intact", () => {
    const html = renderEmailShell({ contentHtml: "x" });
    expect(html).toContain("Inklee. Tattoo bookings, clearly organized.");
  });
});
