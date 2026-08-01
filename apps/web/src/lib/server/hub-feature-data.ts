import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { parseBooksSettings, deriveBooksOpen } from "@/lib/books-settings";
import { todayInTimeZone } from "@/lib/date-utils";
import { canUseGoods } from "@/lib/features";
import { publicCollectionsForArtist } from "./collections";
import {
  parseBioPageSettings,
  isModuleVisible,
  type BioBlock,
} from "@/lib/bio-page-settings";
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
    featuredCollections: {},
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

  // The "goods" feature block deep-links to the booking page's shop teaser
  // (feature-blocks.tsx: href={data.bookingUrl}), so it is gated on that
  // teaser's OWN visibility (decision S4) — a narrow, deliberate cascade that
  // suppresses a broken link, not a surface. When goods-commerce un-parks and
  // this block links to the standalone shop instead, this dependency should
  // be dropped.
  const bioPage = parseBioPageSettings(input.settings.bio_page);
  const goodsBlockAllowed =
    canUseGoods(input.settings) && isModuleVisible(bioPage, "shop");

  if (types.has("goods") && goodsBlockAllowed) {
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
        // `is_public_visible` (migration 0137, decision S3) is the Hub's OWN
        // visibility control, independent of `show_on_booking_form` (the
        // booking page's flag). Before 0137 this read reused
        // show_on_booking_form, which coupled the two surfaces: hiding a trip
        // from the booking form also hid it here, whether the artist meant
        // that or not. Location lives on the linked studio via trip_legs, not
        // on the trip itself.
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await serviceClient
          .from("trips")
          .select(
            "title, trip_legs!inner(starts_on, ends_on, studios(city, country))",
          )
          .eq("artist_id", input.artistId)
          .eq("is_public_visible", true)
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

  // Featured collections (P5d). Reference blocks, so what is loaded depends on
  // WHICH collections the artist named, not merely on the type being present.
  const featuredIds = input.blocks
    .filter((b) => b.type === "featured_collection")
    .map((b) => (b as { collectionId: string }).collectionId);

  if (featuredIds.length > 0 && canUseGoods(input.settings)) {
    jobs.push(
      (async () => {
        // Goes through the shared public read, so entitlement, the kill switch
        // and the visible/archived filter are the SAME rules the shop uses. An
        // unentitled artist gets nothing here, which renders as no block, and
        // never as a broken one.
        const { collections, memberships } = await publicCollectionsForArtist(
          serviceClient,
          input.artistId,
        );
        const wanted = collections.filter((c) => featuredIds.includes(c.id));
        if (wanted.length === 0) return;

        const productIds = [...new Set(memberships.map((m) => m.productId))];
        const { data: products } = await serviceClient
          .from("products")
          .select("id, image_url, image_urls")
          .eq("artist_id", input.artistId)
          .eq("is_public_visible", true)
          .in("status", ["active", "sold_out"])
          .in("id", productIds.length > 0 ? productIds : [""]);

        const thumbById = new Map<string, string | null>();
        for (const p of products ?? []) {
          const list = Array.isArray(p.image_urls)
            ? (p.image_urls as string[])
            : [];
          thumbById.set(
            p.id as string,
            list[0] ?? (p.image_url as string | null) ?? null,
          );
        }

        for (const c of wanted) {
          // Only PURCHASABLE members count. A collection whose products are all
          // draft or hidden is an empty section, and the block renders nothing
          // rather than a heading over nothing.
          const members = memberships
            .filter((m) => m.collectionId === c.id)
            .sort((a, b) => a.position - b.position)
            .filter((m) => thumbById.has(m.productId));
          if (members.length === 0) continue;
          empty.featuredCollections[c.id] = {
            name: c.name,
            productCount: members.length,
            thumbs: members
              .map((m) => thumbById.get(m.productId) ?? null)
              .filter((u): u is string => Boolean(u))
              .slice(0, 3),
          };
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
