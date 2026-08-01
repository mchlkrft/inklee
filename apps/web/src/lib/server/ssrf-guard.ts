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
//
// IPv6 POLICY (HUB-GAL-004, 2026-08-01): every IPv6 address is refused
// outright — see `isPrivateAddress`'s doc comment for why. A public image
// host is always reachable over IPv4, so this is a real capability tradeoff
// with no cost in practice, not a workaround.

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

/**
 * True for loopback (::1), unspecified (::), unique-local (fc00::/7, the
 * IPv6 analogue of RFC1918), and link-local (fe80::/10, the IPv6 analogue of
 * the cloud-metadata range). An IPv4-mapped address in its DOTTED spelling
 * (::ffff:a.b.c.d) is unwrapped and re-checked as IPv4.
 *
 * NOT EXHAUSTIVE (HUB-GAL-004, 2026-08-01, round-4 verification): IPv4 can be
 * embedded in an IPv6 literal in several RFC-legal spellings this function
 * does NOT chase — the HEX-group form of a mapped address (::ffff:7f00:1 ==
 * ::ffff:127.0.0.1), the deprecated IPv4-compatible form (::127.0.0.1, a
 * DIFFERENT prefix than ::ffff:), and the NAT64 well-known prefix
 * (64:ff9b::/96, RFC 6052). Proven: isPrivateIpv6 returns false (allowed) for
 * all of those today, including the hex-group spelling of the cloud-metadata
 * address (::ffff:a9fe:a9fe == ::ffff:169.254.169.254). Regexing every
 * spelling is a losing game (there is no closed list); `isPublicHostname`
 * below does NOT rely on this function's per-address correctness for its
 * real defense — it refuses the entire IPv6 family outright. This function
 * stays as an honestly-scoped, independently-tested utility, not the guard.
 *
 * Fails CLOSED on anything that is not even a syntactically valid IPv6
 * literal (checked via `net.isIP`, not a hand-rolled parse) — previously this
 * returned false (allowed) for a plain unparseable string like "garbage",
 * which contradicted this same comment's old claim of failing closed.
 */
export function isPrivateIpv6(ip: string): boolean {
  if (net.isIP(ip) !== 6) return true;
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link-local
  return false;
}

/**
 * The ONE place `isPublicHostname` decides an address is disallowed.
 *
 * POLICY (HUB-GAL-004, 2026-08-01): every IPv6 address is disallowed,
 * unconditionally — `isPrivateIpv6`'s own recognized-private ranges are never
 * even consulted here. A public image host is reachable over IPv4 regardless,
 * so refusing the whole address family removes every IPv4-in-IPv6 embedding
 * bypass at once (see isPrivateIpv6's doc comment for the specific forms this
 * closes) instead of extending a regex for each newly-discovered spelling.
 * `isPrivateIpv6` remains exported and tested as an honest, narrower-scoped
 * utility; this function simply does not lean on it for the real defense.
 */
function isPrivateAddress(address: string, family: 4 | 6): boolean {
  if (family === 6) return true;
  return isPrivateIpv4(address);
}

/**
 * True when `hostname` is safe to fetch from a server: it resolves (or, for
 * an IP-literal, IS) exclusively PUBLIC IPv4 addresses. Fails CLOSED — a
 * lookup error, an empty result, ANY resolved address landing in a private
 * range, or ANY resolved address being IPv6 at all (see `isPrivateAddress`'s
 * policy comment) makes this false, even if other addresses for the same
 * name are public (a name that resolves to BOTH a public and a private
 * address is exactly the DNS-rebinding shape this guard exists to catch on
 * the visible half).
 *
 * An IPv6 URL LITERAL is refused by this same policy, not by accident: today
 * `new URL(...).hostname` keeps the brackets (e.g. "[::1]"), so `net.isIP`
 * returns 0 and this falls to the DNS-lookup branch, which fails on a
 * bracketed non-hostname string — refused, but only as a side effect. If a
 * future change ever strips the brackets first, `net.isIP` would then report
 * family 6 and the EXPLICIT policy above refuses it directly, with no DNS
 * lookup at all and no dependence on that side effect. Both paths are pinned
 * by name in ssrf-guard.test.ts.
 */
export async function isPublicHostname(hostname: string): Promise<boolean> {
  const literalKind = net.isIP(hostname);
  if (literalKind === 4) return !isPrivateAddress(hostname, 4);
  if (literalKind === 6) return !isPrivateAddress(hostname, 6);

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
