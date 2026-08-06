// Pure path predicate for the edge probe blocker (src/proxy.ts). Path-only, no
// query, no I/O, so it is exhaustively unit-testable. THIS is the authority on
// what gets 404'd: proxy.ts 404s a request if and only if this returns true, and
// blocks nothing else. The proxy matcher only decides WHERE the function runs.
//
// It is deliberately limited to two signals that no legitimate Next route or
// artist slug path can produce, so it can never block a real page:
//
//   1. a CMS / server-script file extension (.php, .aspx, .jsp, ...); and
//   2. a request for a sensitive dotfile (/.env*, /.git*).
//
// It intentionally does NOT block WordPress-style path PREFIXES (/wp-admin,
// /vendor, /administrator): an artist handle could in principle collide with
// one, and those scans almost always target a .php file anyway, which (1)
// already catches. Missing a probe is harmless (the Sentry noise filter,
// OBS-NOISE-001 / src/lib/sentry-noise.ts, still drops the event); blocking a
// real page is not. The rules err toward the former.
//
// .well-known is a legitimate root prefix (Apple app-site-association, ACME) and
// is deliberately never matched.

const BLOCKED_SCRIPT_EXTENSIONS = [
  ".php",
  ".phtml",
  ".php3",
  ".php5",
  ".php7",
  ".asp",
  ".aspx",
  ".jsp",
  ".cgi",
  ".pl",
] as const;

/** True when the request path is an unambiguous exploit-scanner probe that is
 *  safe to answer with a bare 404 before any route runs. */
export function isBlockedProbePath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  if (BLOCKED_SCRIPT_EXTENSIONS.some((ext) => p.endsWith(ext))) return true;
  // Sensitive dotfiles at the site root. /.well-known/* is legitimate and NOT
  // matched by any branch here.
  if (p === "/.env" || p.startsWith("/.env.") || p.startsWith("/.env/")) {
    return true;
  }
  if (p === "/.git" || p.startsWith("/.git/")) return true;
  return false;
}
