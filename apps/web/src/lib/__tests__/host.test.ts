import { describe, it, expect } from "vitest";
import {
  decideHostRouting,
  parseHost,
  prependSlugToPath,
  type HostRouting,
} from "../host";

describe("parseHost — marketing app", () => {
  it("matches inklee.app", () => {
    expect(parseHost("inklee.app")).toEqual({
      kind: "marketing",
      host: "inklee.app",
    });
  });

  it("matches www.inklee.app", () => {
    expect(parseHost("www.inklee.app")).toEqual({
      kind: "marketing",
      host: "www.inklee.app",
    });
  });

  it("lowercases an uppercase host", () => {
    expect(parseHost("INKLEE.APP")).toEqual({
      kind: "marketing",
      host: "inklee.app",
    });
  });

  it("strips a port suffix", () => {
    expect(parseHost("inklee.app:3000")).toEqual({
      kind: "marketing",
      host: "inklee.app",
    });
  });
});

describe("parseHost — shortlink apex", () => {
  it("matches inkl.ee", () => {
    expect(parseHost("inkl.ee")).toEqual({
      kind: "shortlink-apex",
      host: "inkl.ee",
    });
  });

  it("matches www.inkl.ee (apex takes precedence over reserved-subdomain)", () => {
    expect(parseHost("www.inkl.ee")).toEqual({
      kind: "shortlink-apex",
      host: "www.inkl.ee",
    });
  });
});

describe("parseHost — artist subdomain", () => {
  it("parses a valid slug subdomain", () => {
    expect(parseHost("ouch370.inkl.ee")).toEqual({
      kind: "artist-subdomain",
      host: "ouch370.inkl.ee",
      slug: "ouch370",
    });
  });

  it("accepts a slug with a single dash", () => {
    expect(parseHost("a-b.inkl.ee")).toEqual({
      kind: "artist-subdomain",
      host: "a-b.inkl.ee",
      slug: "a-b",
    });
  });

  it("lowercases the slug when the host is uppercase", () => {
    expect(parseHost("OUCH370.INKL.EE")).toEqual({
      kind: "artist-subdomain",
      host: "ouch370.inkl.ee",
      slug: "ouch370",
    });
  });

  it("strips port from an artist subdomain", () => {
    expect(parseHost("ouch370.inkl.ee:443")).toEqual({
      kind: "artist-subdomain",
      host: "ouch370.inkl.ee",
      slug: "ouch370",
    });
  });
});

describe("parseHost — reserved subdomain on inkl.ee", () => {
  it("flags app.inkl.ee as reserved", () => {
    expect(parseHost("app.inkl.ee")).toEqual({
      kind: "shortlink-reserved-subdomain",
      host: "app.inkl.ee",
      name: "app",
    });
  });

  it("flags admin.inkl.ee as reserved", () => {
    expect(parseHost("admin.inkl.ee")).toEqual({
      kind: "shortlink-reserved-subdomain",
      host: "admin.inkl.ee",
      name: "admin",
    });
  });

  it("flags docs.inkl.ee as reserved", () => {
    expect(parseHost("docs.inkl.ee")).toEqual({
      kind: "shortlink-reserved-subdomain",
      host: "docs.inkl.ee",
      name: "docs",
    });
  });

  it("flags a marketing-route name as reserved (dm-chaos.inkl.ee)", () => {
    expect(parseHost("dm-chaos.inkl.ee")).toEqual({
      kind: "shortlink-reserved-subdomain",
      host: "dm-chaos.inkl.ee",
      name: "dm-chaos",
    });
  });
});

describe("parseHost — invalid subdomain on inkl.ee", () => {
  it("rejects a slug starting with a digit", () => {
    const r = parseHost("123foo.inkl.ee");
    expect(r.kind).toBe("shortlink-invalid-subdomain");
  });

  it("rejects a too-short slug", () => {
    const r = parseHost("ab.inkl.ee");
    expect(r.kind).toBe("shortlink-invalid-subdomain");
  });

  it("rejects a nested subdomain", () => {
    const r = parseHost("a.b.inkl.ee");
    expect(r.kind).toBe("shortlink-invalid-subdomain");
    if (r.kind === "shortlink-invalid-subdomain") {
      expect(r.attempted).toBe("a.b");
    }
  });

  it("rejects a slug with a leading dash", () => {
    const r = parseHost("-foo.inkl.ee");
    expect(r.kind).toBe("shortlink-invalid-subdomain");
  });

  it("rejects a slug with a trailing dash", () => {
    const r = parseHost("foo-.inkl.ee");
    expect(r.kind).toBe("shortlink-invalid-subdomain");
  });
});

describe("parseHost — local dev", () => {
  it("matches plain localhost", () => {
    expect(parseHost("localhost")).toEqual({
      kind: "local",
      host: "localhost",
      slug: null,
    });
  });

  it("matches localhost with port", () => {
    expect(parseHost("localhost:3000")).toEqual({
      kind: "local",
      host: "localhost",
      slug: null,
    });
  });

  it("matches 127.0.0.1", () => {
    expect(parseHost("127.0.0.1")).toEqual({
      kind: "local",
      host: "127.0.0.1",
      slug: null,
    });
  });

  it("extracts a slug from name.localhost", () => {
    expect(parseHost("ouch370.localhost")).toEqual({
      kind: "local",
      host: "ouch370.localhost",
      slug: "ouch370",
    });
  });

  it("extracts a slug from name.localhost with port", () => {
    expect(parseHost("ouch370.localhost:3000")).toEqual({
      kind: "local",
      host: "ouch370.localhost",
      slug: "ouch370",
    });
  });

  it("returns slug:null for a reserved name on localhost", () => {
    expect(parseHost("app.localhost")).toEqual({
      kind: "local",
      host: "app.localhost",
      slug: null,
    });
  });

  it("returns slug:null for an invalid-format name on localhost", () => {
    expect(parseHost("ab.localhost")).toEqual({
      kind: "local",
      host: "ab.localhost",
      slug: null,
    });
  });
});

describe("parseHost — vercel preview", () => {
  it("matches a standard preview host", () => {
    expect(parseHost("inklee-abc.vercel.app")).toEqual({
      kind: "preview",
      host: "inklee-abc.vercel.app",
    });
  });
});

describe("parseHost — unknown", () => {
  it("rejects an unrelated domain", () => {
    expect(parseHost("example.com")).toEqual({
      kind: "unknown",
      host: "example.com",
    });
  });

  it("rejects an empty string", () => {
    expect(parseHost("")).toEqual({ kind: "unknown", host: "" });
  });

  it("rejects null", () => {
    expect(parseHost(null)).toEqual({ kind: "unknown", host: "" });
  });

  it("rejects undefined", () => {
    expect(parseHost(undefined)).toEqual({ kind: "unknown", host: "" });
  });
});

describe("prependSlugToPath", () => {
  it("returns /<slug> for empty pathname", () => {
    expect(prependSlugToPath("ouch370", "")).toBe("/ouch370");
  });

  it("returns /<slug> for root pathname", () => {
    expect(prependSlugToPath("ouch370", "/")).toBe("/ouch370");
  });

  it("preserves a leading slash on subpaths", () => {
    expect(prependSlugToPath("ouch370", "/waitlist")).toBe("/ouch370/waitlist");
  });

  it("preserves deeper paths verbatim", () => {
    expect(prependSlugToPath("ouch370", "/flash/days/abc-123")).toBe(
      "/ouch370/flash/days/abc-123",
    );
  });
});

describe("decideHostRouting", () => {
  const url = (pathname: string, search = "") => ({ pathname, search });

  it("passes through marketing host", () => {
    const r: HostRouting = { kind: "marketing", host: "inklee.app" };
    expect(decideHostRouting(r, url("/dashboard"))).toEqual({ action: "pass" });
  });

  it("passes through preview host", () => {
    const r: HostRouting = { kind: "preview", host: "inklee-abc.vercel.app" };
    expect(decideHostRouting(r, url("/about"))).toEqual({ action: "pass" });
  });

  it("passes through unknown host", () => {
    const r: HostRouting = { kind: "unknown", host: "random.com" };
    expect(decideHostRouting(r, url("/"))).toEqual({ action: "pass" });
  });

  it("passes through bare localhost (no slug)", () => {
    const r: HostRouting = { kind: "local", host: "localhost", slug: null };
    expect(decideHostRouting(r, url("/login"))).toEqual({ action: "pass" });
  });

  it("rewrites artist subdomain root path to /<slug>", () => {
    const r: HostRouting = {
      kind: "artist-subdomain",
      host: "ouch370.inkl.ee",
      slug: "ouch370",
    };
    expect(decideHostRouting(r, url("/"))).toEqual({
      action: "rewrite-artist",
      slug: "ouch370",
      pathname: "/ouch370",
      search: "",
    });
  });

  it("rewrites artist subdomain subpath, preserving search", () => {
    const r: HostRouting = {
      kind: "artist-subdomain",
      host: "ouch370.inkl.ee",
      slug: "ouch370",
    };
    expect(decideHostRouting(r, url("/waitlist", "?ref=ig"))).toEqual({
      action: "rewrite-artist",
      slug: "ouch370",
      pathname: "/ouch370/waitlist",
      search: "?ref=ig",
    });
  });

  it("rewrites artist subdomain deep path", () => {
    const r: HostRouting = {
      kind: "artist-subdomain",
      host: "ouch370.inkl.ee",
      slug: "ouch370",
    };
    expect(decideHostRouting(r, url("/flash/days/abc-123"))).toEqual({
      action: "rewrite-artist",
      slug: "ouch370",
      pathname: "/ouch370/flash/days/abc-123",
      search: "",
    });
  });

  it("rewrites local subdomain with slug (dev parity)", () => {
    const r: HostRouting = {
      kind: "local",
      host: "ouch370.localhost",
      slug: "ouch370",
    };
    expect(decideHostRouting(r, url("/"))).toEqual({
      action: "rewrite-artist",
      slug: "ouch370",
      pathname: "/ouch370",
      search: "",
    });
  });

  it("redirects shortlink apex to inklee.app, preserving path + search", () => {
    const r: HostRouting = { kind: "shortlink-apex", host: "inkl.ee" };
    expect(decideHostRouting(r, url("/pricing", "?utm=x"))).toEqual({
      action: "redirect",
      url: "https://inklee.app/pricing?utm=x",
      permanent: true,
    });
  });

  it("redirects reserved subdomain to inklee.app", () => {
    const r: HostRouting = {
      kind: "shortlink-reserved-subdomain",
      host: "app.inkl.ee",
      name: "app",
    };
    expect(decideHostRouting(r, url("/"))).toEqual({
      action: "redirect",
      url: "https://inklee.app/",
      permanent: true,
    });
  });

  it("redirects invalid subdomain to inklee.app", () => {
    const r: HostRouting = {
      kind: "shortlink-invalid-subdomain",
      host: "ab.inkl.ee",
      attempted: "ab",
    };
    expect(decideHostRouting(r, url("/"))).toEqual({
      action: "redirect",
      url: "https://inklee.app/",
      permanent: true,
    });
  });
});
