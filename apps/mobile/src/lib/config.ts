// Single source for the app's environment config. Read EXPO_PUBLIC_* once,
// validate, and export typed values so screens never re-read process.env or
// duplicate fallbacks (the API base previously had two different defaults — ""
// in api.ts and "https://inkl.ee" in more.tsx).

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

if (!API_URL) {
  // Fail loud in dev rather than silently issuing relative-URL fetches that
  // 404 on a native device (which has no origin).
  console.warn(
    "[inklee] EXPO_PUBLIC_API_URL is not set — API calls will fail. Copy .env.example to .env.local.",
  );
}

/** A URL as the artist reads it: protocol stripped (e.g. "mike.inkl.ee").
 *  The one definition behind every link-display Text in the app. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export const config = {
  /** Apex origin serving the API + legal pages, e.g. https://inkl.ee. */
  apiUrl: API_URL,
  /**
   * Public bio page for a slug = a subdomain of the apex
   * (https://<slug>.inkl.ee). Mirrors the web `publicArtistUrl` subdomain mode.
   */
  publicUrl: (slug: string) => API_URL.replace(/^https:\/\//, `https://${slug}.`),
  /**
   * Public Inklee Hub ("Linklee") for a slug = a second-level subdomain
   * (https://<slug>.l.inkl.ee). Mirrors the web `publicHubUrl(slug)`.
   */
  hubUrl: (slug: string) =>
    API_URL.replace(/^https:\/\//, `https://${slug}.l.`),
  /** Public waitlist join page (the bio subdomain + /waitlist). Mirrors the web
   *  `publicArtistUrl(slug, { subpath: "/waitlist" })`. */
  waitlistUrl: (slug: string) =>
    `${API_URL.replace(/^https:\/\//, `https://${slug}.`)}/waitlist`,
} as const;
