import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isBioSubdomainEnabled, publicArtistUrl } from "../public-url";

// process.env is shared mutable state — snapshot + restore per test
// so one mode doesn't bleed into another.
const ENV_KEYS = ["NEXT_PUBLIC_PUBLIC_BIO_DOMAIN", "NEXT_PUBLIC_APP_URL"];

describe("publicArtistUrl", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    ENV_KEYS.forEach((k) => {
      original[k] = process.env[k];
      delete process.env[k];
    });
  });

  afterEach(() => {
    ENV_KEYS.forEach((k) => {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    });
  });

  describe("path mode (NEXT_PUBLIC_PUBLIC_BIO_DOMAIN unset)", () => {
    it("uses NEXT_PUBLIC_APP_URL with the slug as a path segment", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://inklee.app";
      expect(publicArtistUrl("ouch370")).toBe("https://inklee.app/ouch370");
    });

    it("appends a subpath to the path form", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://inklee.app";
      expect(publicArtistUrl("ouch370", { subpath: "/waitlist" })).toBe(
        "https://inklee.app/ouch370/waitlist",
      );
    });

    it("falls back to the hard-coded host when NEXT_PUBLIC_APP_URL is unset", () => {
      expect(publicArtistUrl("ouch370")).toBe("https://inklee.app/ouch370");
    });

    it("respects a localhost NEXT_PUBLIC_APP_URL in dev", () => {
      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
      expect(publicArtistUrl("ouch370")).toBe("http://localhost:3000/ouch370");
    });
  });

  describe("subdomain mode (NEXT_PUBLIC_PUBLIC_BIO_DOMAIN set)", () => {
    it("emits https://<slug>.<bio domain>", () => {
      process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN = "inkl.ee";
      expect(publicArtistUrl("ouch370")).toBe("https://ouch370.inkl.ee");
    });

    it("appends a subpath to the subdomain form", () => {
      process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN = "inkl.ee";
      expect(publicArtistUrl("ouch370", { subpath: "/waitlist" })).toBe(
        "https://ouch370.inkl.ee/waitlist",
      );
    });

    it("tolerates a protocol prefix on the env var", () => {
      process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN = "https://inkl.ee";
      expect(publicArtistUrl("ouch370")).toBe("https://ouch370.inkl.ee");
    });

    it("tolerates a trailing slash on the env var", () => {
      process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN = "inkl.ee/";
      expect(publicArtistUrl("ouch370")).toBe("https://ouch370.inkl.ee");
    });

    it("tolerates whitespace around the env var value", () => {
      process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN = "  inkl.ee  ";
      expect(publicArtistUrl("ouch370")).toBe("https://ouch370.inkl.ee");
    });

    it("treats an empty env var as path mode", () => {
      process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN = "";
      process.env.NEXT_PUBLIC_APP_URL = "https://inklee.app";
      expect(publicArtistUrl("ouch370")).toBe("https://inklee.app/ouch370");
    });
  });

  describe("falsy slug", () => {
    it("returns the app origin for null slug", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://inklee.app";
      expect(publicArtistUrl(null)).toBe("https://inklee.app");
    });

    it("returns the app origin for undefined slug", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://inklee.app";
      expect(publicArtistUrl(undefined)).toBe("https://inklee.app");
    });

    it("returns the app origin for empty string slug", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://inklee.app";
      expect(publicArtistUrl("")).toBe("https://inklee.app");
    });

    it("returns the app origin even in subdomain mode for null slug", () => {
      process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN = "inkl.ee";
      process.env.NEXT_PUBLIC_APP_URL = "https://inklee.app";
      expect(publicArtistUrl(null)).toBe("https://inklee.app");
    });
  });
});

describe("isBioSubdomainEnabled", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    original.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN =
      process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN;
    delete process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN;
  });

  afterEach(() => {
    if (original.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN === undefined)
      delete process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN;
    else
      process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN =
        original.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN;
  });

  it("returns false when the env var is unset", () => {
    expect(isBioSubdomainEnabled()).toBe(false);
  });

  it("returns false when the env var is empty", () => {
    process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN = "";
    expect(isBioSubdomainEnabled()).toBe(false);
  });

  it("returns true when the env var is set to a host", () => {
    process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN = "inkl.ee";
    expect(isBioSubdomainEnabled()).toBe(true);
  });
});
