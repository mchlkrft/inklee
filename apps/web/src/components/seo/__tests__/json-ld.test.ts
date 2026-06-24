import { describe, it, expect } from "vitest";
import { serializeJsonLd } from "../json-ld";

describe("serializeJsonLd (SEO-01)", () => {
  it("escapes < so a </script> payload cannot break out of the tag", () => {
    const out = serializeJsonLd({
      name: "</script><script>alert(1)</script>",
    });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("\\u003c");
  });

  it("preserves normal data", () => {
    expect(serializeJsonLd({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
  });
});
