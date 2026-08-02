import { describe, it, expect } from "vitest";
import { receiptTermsSection } from "@/lib/legal/receipt-terms";
import { getLegalDoc } from "@/lib/legal/documents";

// Counsel Q6(b): the confirmation must carry the Terms TEXT. Everything else
// about this is mocked in the send-site tests, so this is the one place that
// reads the REAL document off disk. Its job is to catch the failure the
// mocked tests structurally cannot: the section is wired correctly everywhere
// and terms.md is nevertheless unreadable at runtime, which would degrade
// both receipts to the non-compliant shape while every other test stays
// green.

describe("receiptTermsSection", () => {
  it("reads the real Terms document and returns it with its version", () => {
    const result = receiptTermsSection();
    expect(result.error).toBeNull();
    const terms = getLegalDoc("terms");
    expect(result.section).toContain(
      `Terms of Service (version ${terms.version}):`,
    );
    expect(result.section).toContain(terms.body.trim());
  });

  it("returns a substantial body, not an empty or frontmatter-only string", () => {
    const result = receiptTermsSection();
    // terms.md is several kilobytes. A near-empty section means the read
    // succeeded against the wrong file or the parser dropped the body, which
    // a `toContain` on the same parse would not notice.
    expect((result.section ?? "").length).toBeGreaterThan(2000);
  });

  it("matches the header shape of the approved Plus E2 confirmation", () => {
    expect(receiptTermsSection().section).toMatch(
      /^Terms of Service \(version \d{4}-\d{2}-\d{2}\):\n\n/,
    );
  });
});
