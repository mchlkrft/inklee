import { describe, expect, it } from "vitest";
import { classifyChannel, isSearchEngine, isSocialNetwork } from "../channels";

describe("classifyChannel", () => {
  describe("UTM precedence", () => {
    it("lets explicit UTM parameters win over the referrer", () => {
      // A google.com referrer alone would classify as organic_search;
      // the email medium must override it.
      expect(
        classifyChannel({
          utmSource: "mailchimp",
          utmMedium: "email",
          referrerDomain: "google.com",
        }),
      ).toBe("email");
    });

    it("classifies a paid medium over an organic-looking referrer", () => {
      expect(
        classifyChannel({
          utmSource: "google",
          utmMedium: "cpc",
          referrerDomain: "instagram.com",
        }),
      ).toBe("paid_search");
    });
  });

  describe("paid channels", () => {
    it("google + cpc is paid_search", () => {
      expect(classifyChannel({ utmSource: "google", utmMedium: "cpc" })).toBe(
        "paid_search",
      );
    });

    it("bing + ppc is paid_search", () => {
      expect(classifyChannel({ utmSource: "bing", utmMedium: "ppc" })).toBe(
        "paid_search",
      );
    });

    it("instagram + paid is paid_social", () => {
      expect(
        classifyChannel({ utmSource: "instagram", utmMedium: "paid" }),
      ).toBe("paid_social");
    });

    it("facebook + paid_social is paid_social", () => {
      expect(
        classifyChannel({ utmSource: "facebook", utmMedium: "paid_social" }),
      ).toBe("paid_social");
    });

    it("a paid medium with an unrecognized source falls back to other", () => {
      expect(
        classifyChannel({ utmSource: "some-ad-network", utmMedium: "cpc" }),
      ).toBe("other");
    });
  });

  describe("email medium", () => {
    it("classifies utm_medium=email", () => {
      expect(classifyChannel({ utmMedium: "email" })).toBe("email");
    });

    it("classifies utm_medium=newsletter", () => {
      expect(
        classifyChannel({
          utmSource: "weekly-digest",
          utmMedium: "newsletter",
        }),
      ).toBe("email");
    });
  });

  describe("organic_social by referrer", () => {
    it.each([
      "instagram.com",
      "l.instagram.com",
      "t.co",
      "reddit.com",
      "out.reddit.com",
    ])("classifies %s as organic_social", (referrerDomain) => {
      expect(classifyChannel({ referrerDomain })).toBe("organic_social");
    });
  });

  describe("organic_search by referrer", () => {
    it.each(["google.com", "www.google.de", "bing.com", "duckduckgo.com"])(
      "classifies %s as organic_search",
      (referrerDomain) => {
        expect(classifyChannel({ referrerDomain })).toBe("organic_search");
      },
    );
  });

  describe("referral and direct", () => {
    it("classifies an unknown external domain as referral", () => {
      expect(
        classifyChannel({ referrerDomain: "tattoo-blog.example.com" }),
      ).toBe("referral");
      expect(classifyChannel({ referrerDomain: "news.ycombinator.com" })).toBe(
        "referral",
      );
    });

    it("classifies no signal at all as direct", () => {
      expect(classifyChannel({})).toBe("direct");
      expect(
        classifyChannel({
          utmSource: null,
          utmMedium: null,
          referrerDomain: null,
        }),
      ).toBe("direct");
    });

    it("treats empty strings as no signal", () => {
      expect(
        classifyChannel({ utmSource: "", utmMedium: "", referrerDomain: "" }),
      ).toBe("direct");
    });
  });

  describe("utm_source without a medium", () => {
    it("utm_source=google without a medium is organic_search", () => {
      expect(classifyChannel({ utmSource: "google" })).toBe("organic_search");
    });

    it("utm_source=instagram without a medium is organic_social", () => {
      expect(classifyChannel({ utmSource: "instagram" })).toBe(
        "organic_social",
      );
    });

    it("an unrecognized source without a medium is other", () => {
      expect(classifyChannel({ utmSource: "qr-code-flyer" })).toBe("other");
    });
  });

  describe("input hygiene", () => {
    it("is case insensitive", () => {
      expect(classifyChannel({ utmSource: "Google", utmMedium: "CPC" })).toBe(
        "paid_search",
      );
      expect(classifyChannel({ utmMedium: "Email" })).toBe("email");
      expect(classifyChannel({ referrerDomain: "Instagram.COM" })).toBe(
        "organic_social",
      );
    });

    it("trims surrounding whitespace", () => {
      expect(
        classifyChannel({ utmSource: "  google  ", utmMedium: " cpc " }),
      ).toBe("paid_search");
      expect(classifyChannel({ referrerDomain: " google.com " })).toBe(
        "organic_search",
      );
    });

    it("whitespace-only values count as no signal", () => {
      expect(classifyChannel({ utmSource: "   ", utmMedium: "   " })).toBe(
        "direct",
      );
    });
  });
});

describe("isSearchEngine", () => {
  it("matches known engines including regional google TLDs", () => {
    expect(isSearchEngine("google.com")).toBe(true);
    expect(isSearchEngine("www.google.de")).toBe(true);
    expect(isSearchEngine("bing.com")).toBe(true);
    expect(isSearchEngine("duckduckgo.com")).toBe(true);
  });

  it("does not match ordinary domains", () => {
    expect(isSearchEngine("example.com")).toBe(false);
  });
});

describe("isSocialNetwork", () => {
  it("matches known networks and their subdomains", () => {
    expect(isSocialNetwork("instagram.com")).toBe(true);
    expect(isSocialNetwork("l.instagram.com")).toBe(true);
    expect(isSocialNetwork("t.co")).toBe(true);
    expect(isSocialNetwork("out.reddit.com")).toBe(true);
  });

  it("does not match ordinary domains", () => {
    expect(isSocialNetwork("example.com")).toBe(false);
  });
});
