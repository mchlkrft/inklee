import type { QueryClient } from "@tanstack/react-query";
import { apiPost, invalidateBookingViews } from "./api";

// Shared waitlist mutations + helpers for the list and detail screens (the
// optimistic cache patches stay screen-local because each screen owns its own
// cache keys; these helpers own the POST + cross-view invalidation).

// A status change can drop an entry from the "waiting" list AND change the
// Home waitlist count — refresh every /waitlist* view plus /home together.
export function invalidateWaitlistViews(client: QueryClient): Promise<void> {
  return client.invalidateQueries({
    predicate: (q) => {
      const p = q.queryKey[1];
      return (
        typeof p === "string" && (p.startsWith("/waitlist") || p === "/home")
      );
    },
  });
}

export async function setWaitlistStatus(
  client: QueryClient,
  id: string,
  status: "contacted" | "dismissed",
): Promise<void> {
  await apiPost(`/waitlist/${id}`, { status });
  void invalidateWaitlistViews(client);
}

// Convert creates an accepted booking + emails the client a magic link, so it
// refreshes the booking views too (not just the waitlist + Home count).
export async function convertWaitlistEntry(
  client: QueryClient,
  id: string,
): Promise<void> {
  await apiPost(`/waitlist/${id}/convert`);
  void invalidateWaitlistViews(client);
  void invalidateBookingViews(client);
}

// Demand by city, mirroring the web's buildCityDemand exactly (lowercase/trim
// grouping so "berlin" / "Berlin " count together, first letter re-capitalized
// for display, sorted by count desc). Counts can undercount past the list
// endpoint's 100-row cap; fine at launch scale.
export function buildCityDemand(
  entries: { city_text: string | null }[],
): { city: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.city_text?.trim()) continue;
    const key = entry.city_text.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      city: key.charAt(0).toUpperCase() + key.slice(1),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// Normalized grouping key for the city filter (same rule as buildCityDemand).
export function cityKey(cityText: string | null): string | null {
  const t = cityText?.trim().toLowerCase();
  return t ? t : null;
}
