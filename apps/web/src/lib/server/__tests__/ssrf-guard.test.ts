import { describe, it, expect, vi, beforeEach } from "vitest";

// SSRF guard for FD4 (gallery "Import from URL", 2026-08-01): private/
// reserved-address detection (pure, exhaustively testable) and the resolver
// that decides whether a hostname is safe to fetch from the server.

const { mockLookup } = vi.hoisted(() => ({ mockLookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  lookup: (...a: unknown[]) => mockLookup(...a),
}));

import { isPrivateIpv4, isPrivateIpv6, isPublicHostname } from "../ssrf-guard";

describe("isPrivateIpv4", () => {
  it("blocks loopback, RFC1918, link-local (incl. cloud metadata), and CGNAT", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // AWS/GCP/Azure metadata endpoint
      "100.64.0.1",
      "0.0.0.0",
    ]) {
      expect(isPrivateIpv4(ip), ip).toBe(true);
    }
  });

  it("blocks documentation, benchmarking, multicast and reserved ranges", () => {
    for (const ip of [
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateIpv4(ip), ip).toBe(true);
    }
  });

  it("allows plainly public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      expect(isPrivateIpv4(ip), ip).toBe(false);
    }
  });

  it("does not confuse a similar-looking public range with 172.16.0.0/12", () => {
    expect(isPrivateIpv4("172.15.255.255")).toBe(false);
    expect(isPrivateIpv4("172.32.0.0")).toBe(false);
  });

  it("fails CLOSED on anything unparseable", () => {
    expect(isPrivateIpv4("not-an-ip")).toBe(true);
    expect(isPrivateIpv4("999.1.1.1")).toBe(true);
    expect(isPrivateIpv4("1.2.3")).toBe(true);
  });
});

describe("isPrivateIpv6", () => {
  it("blocks loopback, unspecified, unique-local and link-local", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1"]) {
      expect(isPrivateIpv6(ip), ip).toBe(true);
    }
  });

  it("unwraps an IPv4-mapped address and re-checks it as IPv4", () => {
    expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:8.8.8.8")).toBe(false);
  });

  it("allows a plainly public IPv6 address", () => {
    expect(isPrivateIpv6("2001:4860:4860::8888")).toBe(false); // Google DNS
  });

  // HUB-GAL-004 (2026-08-01, round-4 verification): fixed to fail CLOSED on
  // anything that is not even a syntactically valid IPv6 literal, via
  // net.isIP rather than falling through unmatched patterns to `false`.
  it("fails CLOSED on an unparseable/garbage string (previously fell OPEN)", () => {
    expect(isPrivateIpv6("garbage")).toBe(true);
    expect(isPrivateIpv6("not-an-ipv6-address-at-all")).toBe(true);
    expect(isPrivateIpv6("")).toBe(true);
  });

  // HUB-GAL-004: documents what this function does NOT catch on its own —
  // these are all real, RFC-legal spellings of a private/metadata address,
  // and isPrivateIpv6 allows every one because its patterns only match the
  // dotted-quad mapped spelling. This is the reason isPublicHostname (below)
  // does not rely on isPrivateIpv6 for its real defense and instead refuses
  // the entire IPv6 family outright.
  it("does NOT catch every IPv4-in-IPv6 embedding format (known, documented limit)", () => {
    // hex-group mapped (RFC 4291 alternate spelling of ::ffff:127.0.0.1)
    expect(isPrivateIpv6("::ffff:7f00:1")).toBe(false);
    // hex-group mapped cloud-metadata address (::ffff:169.254.169.254)
    expect(isPrivateIpv6("::ffff:a9fe:a9fe")).toBe(false);
    // deprecated IPv4-compatible form (::a.b.c.d, distinct from ::ffff:a.b.c.d)
    expect(isPrivateIpv6("::127.0.0.1")).toBe(false);
    // NAT64 well-known prefix (RFC 6052) embedding 127.0.0.1
    expect(isPrivateIpv6("64:ff9b::7f00:1")).toBe(false);
  });
});

describe("isPublicHostname", () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it("checks an IP-literal hostname directly, without a DNS lookup", async () => {
    expect(await isPublicHostname("127.0.0.1")).toBe(false);
    expect(await isPublicHostname("8.8.8.8")).toBe(true);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("resolves a domain name and allows it when every address is public IPv4", async () => {
    // HUB-GAL-004: a v6 address used to be allowed here alongside the v4 one;
    // under the blanket IPv6-refusal policy this fixture is v4-only on
    // purpose (see the dedicated "blanket IPv6 refusal" block below for what
    // happens when a v6 address is present).
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "8.8.8.8", family: 4 },
    ]);
    expect(await isPublicHostname("example.com")).toBe(true);
  });

  it("blocks a domain name when ANY resolved address is private (DNS-rebinding shape)", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    expect(await isPublicHostname("attacker.example")).toBe(false);
  });

  it("fails CLOSED when resolution throws or returns nothing", async () => {
    mockLookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await isPublicHostname("nowhere.invalid")).toBe(false);
    mockLookup.mockResolvedValueOnce([]);
    expect(await isPublicHostname("empty.invalid")).toBe(false);
  });
});

// HUB-GAL-004 (2026-08-01, round-4 verification): isPublicHostname refuses
// EVERY IPv6 address outright — it does not consult isPrivateIpv6's
// per-address judgment at all. Proven here against exactly the forms
// isPrivateIpv6 itself allows (the "known limit" block above), so these
// tests are meaningful evidence of the BLANKET policy, not a restatement of
// isPrivateIpv6's own loopback/link-local checks.
describe("isPublicHostname — blanket IPv6 refusal (HUB-GAL-004)", () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it("refuses IPv6 literals that isPrivateIpv6 itself does NOT recognize as private", async () => {
    for (const ip of [
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "::127.0.0.1",
      "64:ff9b::7f00:1",
    ]) {
      expect(await isPublicHostname(ip), ip).toBe(false);
    }
    expect(mockLookup).not.toHaveBeenCalled(); // literal-IP path, no DNS needed
  });

  it("refuses a DNS-resolved IPv6 address even when it is a plainly public one", async () => {
    mockLookup.mockResolvedValue([
      { address: "2606:4700:4700::1111", family: 6 }, // Cloudflare DNS, genuinely public
    ]);
    expect(await isPublicHostname("dual-stack.example")).toBe(false);
  });

  it("refuses when a resolved set mixes a public v4 with ANY v6 address", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
    expect(await isPublicHostname("dual-stack.example")).toBe(false);
  });

  it("refuses an IPv6 URL literal whether or not a future change strips the brackets first", async () => {
    // Bracketed (what URL.hostname actually returns for an IPv6 host today):
    // net.isIP("[::1]") is 0, so this falls to the DNS-lookup branch, which
    // fails on a non-hostname string — refused, but as a documented SIDE
    // EFFECT, not the real policy.
    mockLookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await isPublicHostname("[::1]")).toBe(false);
    expect(mockLookup).toHaveBeenCalledWith("[::1]", expect.anything());

    // Unbracketed (what a future "helpful" normalization might produce):
    // net.isIP recognizes this as a literal IPv6 address, and the EXPLICIT
    // blanket policy refuses it directly — no DNS lookup at all. Using
    // "::ffff:a9fe:a9fe" (a documented isPrivateIpv6 hole, not its own
    // loopback/link-local match) proves this is the BLANKET policy doing the
    // work, not a coincidental isPrivateIpv6 hit.
    mockLookup.mockClear();
    expect(await isPublicHostname("::ffff:a9fe:a9fe")).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });
});
