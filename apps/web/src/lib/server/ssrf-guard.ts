import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

// SSRF guard for fetching an ARTIST-SUPPLIED, otherwise-arbitrary URL
// server-side (founder ruling FD4, 2026-08-01: the gallery "Import from URL"
// action). This is a different shape of problem than
// `instagram-storage.ts`'s `downloadInstagramThumbnail`, which trusts a FIXED
// host allowlist (Instagram/Facebook's own CDN) — the whole point of THIS
// feature is fetching a host nobody pre-approved. The defense here is
// resolving the hostname and refusing to fetch if it (or any address it
// resolves to) is a private, loopback, link-local, or otherwise non-public
// address, which closes the classic "fetch the cloud metadata endpoint" /
// "fetch localhost" / "fetch the internal admin panel" SSRF class.
//
// RESIDUAL RISK, recorded rather than hidden (see docs/audit/findings.yaml):
// this validates the address BEFORE the request, not the address the
// eventual `fetch()` call actually connects to. A DNS-rebinding attacker who
// controls a domain's records could serve a public address to this check and
// a private one moments later to the real connection. Fully closing that
// needs resolving to ONE validated address and connecting to it directly
// (bypassing a second, independent DNS lookup inside `fetch`) via a custom
// dispatcher — a larger change than this slice. `redirect: "error"` on the
// caller's `fetch()` call (gallery-url-import.ts) closes the OTHER classic
// bypass, redirecting through the check to an internal host, completely:
// there is no second hop to rebind.

function parseIPv4Octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** True for loopback, private (RFC1918), link-local (incl. the 169.254.169.254
 *  cloud-metadata address every provider uses), CGNAT, documentation, and
 *  multicast/reserved IPv4 ranges. Fails CLOSED (true = blocked) on anything
 *  that doesn't parse as four dotted octets. */
export function isPrivateIpv4(ip: string): boolean {
  const o = parseIPv4Octets(ip);
  if (!o) return true;
  const [a, b, c] = o;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24 (doc)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (doc)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (doc)
  if (a >= 224) return true; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255
  return false;
}

/** True for loopback (::1), unspecified (::), unique-local (fc00::/7,
 *  the IPv6 analogue of RFC1918), and link-local (fe80::/10, the IPv6
 *  analogue of the cloud-metadata range). An IPv4-mapped address
 *  (::ffff:a.b.c.d) is unwrapped and re-checked as IPv4, so a v4 address
 *  can't sneak past an IPv6-shaped check. Fails CLOSED on anything
 *  unrecognized in a way that looks deliberately obscured; a plain unmatched
 *  global address returns false (allowed). */
export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link-local
  return false;
}

function isPrivateAddress(address: string, family: 4 | 6): boolean {
  return family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);
}

/**
 * True when `hostname` is safe to fetch from a server: it resolves (or, for
 * an IP-literal, IS) exclusively PUBLIC addresses. Fails CLOSED — a lookup
 * error, an empty result, or ANY resolved address landing in a private range
 * makes this false, even if other addresses for the same name are public
 * (a name that resolves to BOTH a public and a private address is exactly
 * the DNS-rebinding shape this guard exists to catch on the visible half).
 */
export async function isPublicHostname(hostname: string): Promise<boolean> {
  const literalKind = net.isIP(hostname);
  if (literalKind === 4) return !isPrivateIpv4(hostname);
  if (literalKind === 6) return !isPrivateIpv6(hostname);

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;
  return addresses.every(
    (a) => !isPrivateAddress(a.address, a.family === 6 ? 6 : 4),
  );
}
