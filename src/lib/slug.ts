export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "settings",
  "signup",
  "signin",
  "login",
  "logout",
  "help",
  "terms",
  "privacy",
  "imprint",
  "impressum",
  "about",
  "blog",
  "pricing",
  "dashboard",
  "request",
  "auth",
  "static",
  "public",
  "favicon",
  "robots",
  "sitemap",
  "404",
  "500",
  "onboarding",
  "dev",
  "inklee",
  "www",
  "support",
  "contact",
  "null",
  "undefined",
]);

const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function validateSlug(s: string): string | null {
  if (s.length < 3) return "too short — minimum 3 characters";
  if (s.length > 30) return "too long — maximum 30 characters";
  if (!SLUG_RE.test(s))
    return "lowercase letters, numbers, and single dashes only — must start with a letter";
  if (RESERVED_SLUGS.has(s)) return "that one is reserved — try something else";
  return null;
}
