import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { parseBooksSettings, deriveBooksOpen } from "@/lib/books-settings";
import { todayInTimeZone } from "@/lib/date-utils";
import { canUseGoods } from "@/lib/features";
import type { BioBlock } from "@/lib/bio-page-settings";
import type { HubFeatureData } from "@/app/[slug]/hub/feature-blocks";

// Data loader for the hub's feature blocks (Plus build P2b).
//
// Only queries what the artist's blocks actually need: a hub with no feature
// blocks costs zero extra reads, and adding one block does not pull the other
// four. Every query is independently optional and every failure degrades to
// "no data", which the blocks render as nothing rather than as an error: a
// link-in-bio page must never break because a shop query blipped.

export async function loadHubFeatureData(input: {
  artistId: string;
  settings: Record<string, unknown>;
  blocks: BioBlock[];
  bookingUrl: string;
  timezone?: string | null;
}): Promise<HubFeatureData> {
  const types = new Set(input.blocks.map((b) => b.type));
  const empty: HubFeatureData = {
    booksOpen: false,
    bookingUrl: input.bookingUrl,
    productCount: 0,
    productThumbs: [],
    tripCount: 0,
    nextTripLabel: null,
    flashCount: 0,
  };

  // Books state is settings-only (no query), and two blocks read it.
  if (types.has("books_status") || types.has("booking_form")) {
    const books = parseBooksSettings(input.settings.books_settings);
    const today = todayInTimeZone(
      (input.timezone as string | null) ?? "Europe/Berlin",
    );
    empty.booksOpen = deriveBooksOpen(books, today).booksOpen;
  }

  const jobs: Promise<void>[] = [];

  if (types.has("goods") && canUseGoods(input.settings)) {
    jobs.push(
      (async () => {
        const { data } = await serviceClient
          .from("products")
          .select("image_url, image_urls")
          .eq("artist_id", input.artistId)
          .eq("is_public_visible", true)
          .in("status", ["active", "sold_out"])
          .order("sort_order", { ascending: true })
          .limit(24);
        const rows = data ?? [];
        empty.productCount = rows.length;
        empty.productThumbs = rows
          .map((r) => {
            const list = Array.isArray(r.image_urls)
              ? (r.image_urls as string[])
              : [];
            return list[0] ?? (r.image_url as string | null) ?? null;
          })
          .filter((u): u is string => Boolean(u))
          .slice(0, 3);
      })().catch(() => {}),
    );
  }

  if (types.has("guest_spots")) {
    jobs.push(
      (async () => {
        // Mirrors the booking page's trip query exactly: `show_on_booking_form`
        // is the artist's public-visibility control (there is no
        // is_public_visible on trips), and location lives on the linked studio
        // via trip_legs, not on the trip itself.
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await serviceClient
          .from("trips")
          .select(
            "title, trip_legs!inner(starts_on, ends_on, studios(city, country))",
          )
          .eq("artist_id", input.artistId)
          .eq("show_on_booking_form", true)
          .gte("trip_legs.ends_on", today)
          .order("starts_on", {
            ascending: true,
            referencedTable: "trip_legs",
          })
          .limit(12);
        // PostgREST returns an embedded to-one as an ARRAY here, so normalize
        // rather than trusting the singular shape.
        type StudioRef = { city: string | null; country: string | null };
        const rows = (data ?? []) as unknown as Array<{
          title: string | null;
          trip_legs: Array<{ studios: StudioRef | StudioRef[] | null }> | null;
        }>;
        empty.tripCount = rows.length;
        const first = rows[0];
        if (first) {
          const raw = first.trip_legs?.[0]?.studios ?? null;
          const studio = Array.isArray(raw) ? (raw[0] ?? null) : raw;
          empty.nextTripLabel =
            [studio?.city, studio?.country].filter(Boolean).join(", ") ||
            first.title ||
            null;
        }
      })().catch(() => {}),
    );
  }

  if (types.has("flash")) {
    jobs.push(
      (async () => {
        // `published` is the public status (0018 CHECK: draft | published |
        // archived); the public flash page is RLS-scoped to it.
        const { count } = await serviceClient
          .from("flash_items")
          .select("id", { count: "exact", head: true })
          .eq("artist_id", input.artistId)
          .eq("status", "published");
        empty.flashCount = count ?? 0;
      })().catch(() => {}),
    );
  }

  await Promise.all(jobs);
  return empty;
}
