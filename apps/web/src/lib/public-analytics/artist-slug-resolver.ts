import { serviceClient } from "@/lib/supabase/service";

const cache = new Map<string, { artistId: string; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function resolveArtistSlug(slug: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > now) return cached.artistId;

  const { data } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;

  cache.set(slug, { artistId: data.id, expiresAt: now + TTL_MS });
  return data.id;
}

const ARTIST_PAGE_PATTERNS = [
  /^\/([a-z0-9][a-z0-9_-]{1,39})\/hub$/,
  /^\/([a-z0-9][a-z0-9_-]{1,39})$/,
  /^\/([a-z0-9][a-z0-9_-]{1,39})\/shop$/,
  /^\/([a-z0-9][a-z0-9_-]{1,39})\/project$/,
];

export function extractArtistSlug(
  pathname: string,
  hostname: string,
): { slug: string; surface: string } | null {
  const host = hostname.toLowerCase();
  if (host.endsWith(".l.inkl.ee") && host !== "l.inkl.ee") {
    const slug = host.replace(".l.inkl.ee", "");
    return slug ? { slug, surface: "hub" } : null;
  }

  for (const pattern of ARTIST_PAGE_PATTERNS) {
    const match = pathname.match(pattern);
    if (match) {
      const slug = match[1];
      const surface = pathname.endsWith("/hub")
        ? "hub"
        : pathname.endsWith("/shop")
          ? "shop"
          : pathname.endsWith("/project")
            ? "large_project"
            : "booking_form";
      return { slug, surface };
    }
  }

  return null;
}
