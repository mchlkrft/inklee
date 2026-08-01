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

  it("resolves a domain name and allows it when every address is public", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
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
