import { describe, expect, it } from "vitest";
import {
  cleanCountryCode,
  cleanUtm,
  isAllowedHostname,
  isBotUserAgent,
  normalizePathname,
  parseUserAgent,
  referrerDomainOf,
  visitorDayHash,
} from "../enrich";

const CHROME_WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

describe("normalizePathname", () => {
  it("strips query strings and hashes", () => {
    expect(normalizePathname("/about?utm_source=x")).toBe("/about");
    expect(normalizePathname("/about#pricing")).toBe("/about");
    expect(normalizePathname("/about?x=1#y")).toBe("/about");
  });

  it("collapses duplicate slashes", () => {
    expect(normalizePathname("//guides//deposits")).toBe("/guides/deposits");
  });

  it("drops the trailing slash but keeps the root", () => {
    expect(normalizePathname("/about/")).toBe("/about");
    expect(normalizePathname("/")).toBe("/");
  });

  it("rejects paths that do not start with a slash", () => {
    expect(normalizePathname("about")).toBe(null);
    expect(normalizePathname("example.com/about")).toBe(null);
    expect(normalizePathname("")).toBe(null);
  });

  it("rejects paths longer than 300 characters", () => {
    expect(normalizePathname(`/${"a".repeat(300)}`)).toBe(null);
    expect(normalizePathname(`/${"a".repeat(299)}`)).toBe(
      `/${"a".repeat(299)}`,
    );
  });
});

describe("referrerDomainOf", () => {
  it("reduces a full URL to its host", () => {
    expect(referrerDomainOf("https://www.google.com/search?q=tattoo")).toBe(
      "www.google.com",
    );
    expect(
      referrerDomainOf("https://l.instagram.com/?u=https%3A%2F%2Finklee.app"),
    ).toBe("l.instagram.com");
  });

  it("accepts bare domains without a scheme", () => {
    expect(referrerDomainOf("instagram.com")).toBe("instagram.com");
  });

  it("never returns paths or query strings", () => {
    const host = referrerDomainOf(
      "https://example.com/private/path?token=secret",
    );
    expect(host).toBe("example.com");
    expect(host).not.toContain("/private");
    expect(host).not.toContain("token");
  });

  it("lowercases the host", () => {
    expect(referrerDomainOf("https://Google.COM/x")).toBe("google.com");
  });

  it("returns null for invalid or missing input", () => {
    expect(referrerDomainOf("not a url at all")).toBe(null);
    expect(referrerDomainOf("")).toBe(null);
    expect(referrerDomainOf(null)).toBe(null);
    expect(referrerDomainOf(undefined)).toBe(null);
  });

  it("returns null for absurdly long hosts", () => {
    expect(referrerDomainOf(`${"a".repeat(130)}.com`)).toBe(null);
  });
});

describe("isBotUserAgent", () => {
  it("flags known crawlers", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      ),
    ).toBe(true);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      ),
    ).toBe(true);
  });

  it("flags headless automation", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36",
      ),
    ).toBe(true);
  });

  it("flags command-line clients", () => {
    expect(isBotUserAgent("curl/8.4.0 (x86_64-pc-linux-gnu) libcurl")).toBe(
      true,
    );
    expect(isBotUserAgent("python-requests/2.31.0 CPython/3.11")).toBe(true);
  });

  it("flags uptime monitors", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
      ),
    ).toBe(true);
    expect(
      isBotUserAgent("Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)"),
    ).toBe(true);
  });

  it("treats a missing or implausibly short user agent as a bot", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0")).toBe(true);
  });

  it("passes a real Chrome user agent", () => {
    expect(isBotUserAgent(CHROME_WINDOWS_UA)).toBe(false);
  });

  it("passes a real iPhone Safari user agent", () => {
    expect(isBotUserAgent(IPHONE_SAFARI_UA)).toBe(false);
  });
});

describe("parseUserAgent", () => {
  it("classifies Chrome on Windows as desktop", () => {
    expect(parseUserAgent(CHROME_WINDOWS_UA)).toEqual({
      deviceType: "desktop",
      browserFamily: "chrome",
      osFamily: "windows",
      stabilitySignal: "chrome:windows:desktop",
    });
  });

  it("classifies iPhone Safari as mobile", () => {
    expect(parseUserAgent(IPHONE_SAFARI_UA)).toEqual({
      deviceType: "mobile",
      browserFamily: "safari",
      osFamily: "ios",
      stabilitySignal: "safari:ios:mobile",
    });
  });

  it("classifies an iPad as tablet", () => {
    expect(parseUserAgent(IPAD_SAFARI_UA)).toMatchObject({
      deviceType: "tablet",
      osFamily: "ios",
    });
  });

  it("classifies Android Chrome as mobile", () => {
    expect(parseUserAgent(ANDROID_CHROME_UA)).toEqual({
      deviceType: "mobile",
      browserFamily: "chrome",
      osFamily: "android",
      stabilitySignal: "chrome:android:mobile",
    });
  });
});

describe("visitorDayHash", () => {
  const base = {
    secret: "test-secret",
    dateKey: "2026-07-10",
    hostname: "inklee.app",
    ip: "203.0.113.42",
    uaSignal: "chrome:windows:desktop",
  };

  it("is stable for identical inputs", () => {
    expect(visitorDayHash(base)).toBe(visitorDayHash({ ...base }));
  });

  it("rotates when the date changes", () => {
    expect(visitorDayHash(base)).not.toBe(
      visitorDayHash({ ...base, dateKey: "2026-07-11" }),
    );
  });

  it("differs for different IPs", () => {
    expect(visitorDayHash(base)).not.toBe(
      visitorDayHash({ ...base, ip: "203.0.113.43" }),
    );
  });

  it("never leaks the IP into the output", () => {
    const hash = visitorDayHash(base);
    expect(hash).not.toContain(base.ip);
    expect(hash).not.toContain("203.0.113");
  });

  it("produces a short url-safe token", () => {
    expect(visitorDayHash(base)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("is case insensitive on the hostname", () => {
    expect(visitorDayHash({ ...base, hostname: "INKLEE.APP" })).toBe(
      visitorDayHash(base),
    );
  });
});

describe("cleanUtm", () => {
  it("keeps only the five allowlisted UTM keys", () => {
    expect(
      cleanUtm({
        utmSource: "instagram",
        utmMedium: "social",
        utmCampaign: "launch",
        utmContent: "bio-link",
        utmTerm: "tattoo",
        utmEvil: "nope",
        gclid: "abc123",
      }),
    ).toEqual({
      source: "instagram",
      medium: "social",
      campaign: "launch",
      content: "bio-link",
      term: "tattoo",
    });
  });

  it("clamps values to 150 characters", () => {
    const out = cleanUtm({ utmCampaign: "x".repeat(200) });
    expect(out.campaign).toBe("x".repeat(150));
  });

  it("drops values containing @", () => {
    expect(cleanUtm({ utmSource: "someone@example.com" })).toEqual({});
  });

  it("drops values containing ://", () => {
    expect(cleanUtm({ utmSource: "https://evil.example.com" })).toEqual({});
  });

  it("skips non-string and empty values", () => {
    expect(
      cleanUtm({ utmSource: 42, utmMedium: null, utmCampaign: "   " }),
    ).toEqual({});
  });
});

describe("isAllowedHostname", () => {
  it.each([
    "inklee.app",
    "www.inklee.app",
    "inkl.ee",
    "mikey.inkl.ee",
    "hub.l.inkl.ee",
  ])("allows %s", (hostname) => {
    expect(isAllowedHostname(hostname)).toBe(true);
  });

  it.each(["evil.com", "inklee.app.evil.com", "notinklee.app.example.org"])(
    "rejects %s",
    (hostname) => {
      expect(isAllowedHostname(hostname)).toBe(false);
    },
  );

  it("is case insensitive", () => {
    expect(isAllowedHostname("INKLEE.APP")).toBe(true);
    expect(isAllowedHostname("Mikey.Inkl.EE")).toBe(true);
  });
});

describe("cleanCountryCode", () => {
  it("accepts a two-letter code and uppercases it", () => {
    expect(cleanCountryCode("DE")).toBe("DE");
    expect(cleanCountryCode("de")).toBe("DE");
    expect(cleanCountryCode(" gb ")).toBe("GB");
  });

  it("rejects anything that is not exactly two letters", () => {
    expect(cleanCountryCode("DEU")).toBe(null);
    expect(cleanCountryCode("D")).toBe(null);
    expect(cleanCountryCode("D1")).toBe(null);
    expect(cleanCountryCode("")).toBe(null);
    expect(cleanCountryCode(null)).toBe(null);
  });
});
