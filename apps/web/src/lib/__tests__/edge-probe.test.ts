import { describe, it, expect } from "vitest";
import { isBlockedProbePath } from "../edge-probe";

describe("isBlockedProbePath", () => {
  it("blocks CMS / PHP / script probes (including the observed Joomla scan)", () => {
    for (const path of [
      "/index.php", // the observed com_sppagebuilder probe hits this path
      "/wp-login.php",
      "/xmlrpc.php",
      "/wp-admin/admin-ajax.php",
      "/administrator/index.php",
      "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
      "/old/wp-content/plugins/x/shell.php5",
      "/shell.aspx",
      "/cmd.asp",
      "/x.jsp",
      "/probe.cgi",
      "/legacy.pl",
      "/INDEX.PHP", // case-insensitive
    ]) {
      expect(isBlockedProbePath(path), path).toBe(true);
    }
  });

  it("blocks sensitive dotfiles but NOT /.well-known", () => {
    expect(isBlockedProbePath("/.env")).toBe(true);
    expect(isBlockedProbePath("/.env.local")).toBe(true);
    expect(isBlockedProbePath("/.env.production")).toBe(true);
    expect(isBlockedProbePath("/.git")).toBe(true);
    expect(isBlockedProbePath("/.git/config")).toBe(true);
    // Legitimate: Apple app-site-association / ACME live here.
    expect(isBlockedProbePath("/.well-known/apple-app-site-association")).toBe(
      false,
    );
    expect(isBlockedProbePath("/.well-known/acme-challenge/token")).toBe(false);
  });

  it("does NOT block any real Inklee route family", () => {
    for (const path of [
      "/",
      "/some-artist-handle",
      "/some-artist/flash",
      "/some-artist/waitlist",
      "/some-artist/shop/checkout",
      "/studios/berlin-ink",
      "/pricing",
      "/settings/payouts",
      "/api/stripe/webhook",
      "/api/mobile/config",
      "/imprint",
      "/map",
      "/admin/growth",
      "/founding-artists",
      "/guest-spot-booking",
      "/_next/static/chunks/main.js",
      "/favicon.ico",
      "/sitemap.xml",
      "/robots.txt",
      // Adversarial: a handle that merely CONTAINS "php" or matches a blocked
      // prefix word must not be blocked — only a real script extension /
      // dotfile is.
      "/philipp",
      "/graphql-artist",
      "/wp-admin", // no .php, not a dotfile -> passes (could be a handle)
      "/vendor", // ditto
    ]) {
      expect(isBlockedProbePath(path), path).toBe(false);
    }
  });
});
