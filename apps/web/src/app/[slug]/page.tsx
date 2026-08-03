import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import BookingForm from "./booking-form";
import BooksClosedBlock from "./books-closed-block";
import WaitlistForm from "./waitlist-form";
import BookingPolicyBlock from "./booking-policy-block";
import ShopTeaser from "./shop-teaser";
import TravelCard from "./travel-card";
import { InterestSelectionsProvider } from "./interest-selections-context";
import { formatSlotDisplay } from "@/lib/timezone";
import { normalizeFieldRow, type CustomFieldDef } from "@/lib/custom-fields";
import { parseFormSettings, buildDefaultFieldOrder } from "@/lib/form-settings";
import { parseBooksSettings, deriveBooksOpen } from "@/lib/books-settings";
import { serviceClient } from "@/lib/supabase/service";
import { publicBrandingHidden } from "@/lib/server/public-branding";
import { surfaceAppearance } from "@/lib/server/appearance";
import { resolvedSurfaceContent } from "@/lib/server/surface-content";
import { applyConditionEntitlement } from "@/lib/server/form-entitlements";
import { accentHex } from "@inklee/shared/appearance";
import { COVER_COLORS } from "@inklee/shared/cover-colors";
import { bookingTemplateStyles } from "@inklee/shared/booking-template-styles";
import { shopAvailabilityResolver } from "@/lib/server/shop-availability";
import {
  resolveFeaturedCollections,
  type ProductCollection,
  type CollectionMembership,
  type FeaturedCollectionSummary,
} from "@inklee/shared/collections";
import { publicCollectionsForArtist } from "@/lib/server/collections";
import { publicBundlesForArtist } from "@/lib/server/bundles";
import type { PublicBundle } from "./shop-teaser";
import {
  dateKeyInTimeZone,
  formatDateKey,
  todayInTimeZone,
} from "@/lib/date-utils";
import { clampDescription } from "@/lib/seo";
import { apexHref, publicArtistUrl } from "@/lib/public-url";
import { parseBioPageSettings, isModuleVisible } from "@/lib/bio-page-settings";
import {
  isProductCategory,
  toPriceNumber,
  PUBLIC_SHOP_PRODUCT_SELECT,
  type PublicProduct,
} from "@/lib/goods";
import { canUseGoods } from "@/lib/features";

export type SlotOption = {
  id: string;
  date: string;
  time: string;
  tz: string;
  location?: {
    label: string;
    tripTitle?: string;
  };
};

const FALLBACK_METADATA: Metadata = {
  title: "Tattoo Booking · Inklee",
  description:
    "Send a tattoo booking request through Inklee with your idea, references, placement, size, and preferred date.",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("display_name, location")
    .eq("slug", slug)
    .eq("account_status", "active")
    .single();

  if (!profile?.display_name) return FALLBACK_METADATA;

  const name = profile.display_name as string;
  const location = (profile.location as string | null)?.trim() || null;
  const locationPhrase = location ? ` in ${location}` : "";

  const description = clampDescription(
    `Book a tattoo with ${name}${locationPhrase}. Send your idea, references, placement, size, and preferred date.`,
  );
  const ogDescription = clampDescription(
    `Send ${name} your tattoo idea, references, placement, size, and preferred date through Inklee.`,
  );

  // Canonical points at the preferred public URL — subdomain form when
  // NEXT_PUBLIC_PUBLIC_BIO_DOMAIN is set, path form otherwise. The page
  // is reachable via both shapes (path on inklee.app, subdomain on
  // inkl.ee) and we want search engines to consolidate ranking signals
  // on a single canonical URL.
  const canonical = publicArtistUrl(slug);

  return {
    title: `${name}, tattoo booking · Inklee`,
    description,
    alternates: { canonical },
    // Per-artist booking pages are templated and thin at scale, and an artist may
    // not expect to surface in Google, so keep them OUT of the index by default
    // (founder decision 2026-06-16). They stay fully shareable; follow lets the
    // page's links be crawled. A per-artist "list me in search" opt-in can lift
    // this later.
    robots: { index: false, follow: true },
    openGraph: {
      title: `Book a tattoo with ${name}`,
      description: ogDescription,
      type: "profile",
      url: canonical,
    },
    twitter: {
      card: "summary",
      title: `Book a tattoo with ${name}`,
      description: ogDescription,
    },
  };
}

export default async function ArtistPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select(
      "id, display_name, bio, logo_url, instagram_handle, location, booking_mode, timezone, settings",
    )
    .eq("slug", slug)
    .eq("account_status", "active")
    .single();

  if (!profile) notFound();

  // BM-2.0: hide the "made with Inklee" footer for a branding-entitled artist
  // (dark-launched, fail-safe: keeps the footer on any plan-read blip).
  const hideBranding = await publicBrandingHidden(profile.id as string);

  const isSlotMode = profile.booking_mode === "fixed_slots";
  let slots: SlotOption[] = [];
  let customFields: CustomFieldDef[] = [];
  const profileSettings = (profile.settings ?? {}) as Record<string, unknown>;
  const formSettings = parseFormSettings(profileSettings.form_settings);

  // Shared appearance system (P1b). The booking form and the shop teaser it
  // hosts both render inside this surface, so one resolution covers both.
  const appearance = await surfaceAppearance(
    profile.id as string,
    profileSettings,
    "bookingForm",
  );
  // Cover image + colour now come from the resolved appearance rather than
  // being read from settings a second time (P3c). The parser synthesizes both
  // from the legacy `cover_image_url` / `cover_color`, so an artist who never
  // opened the appearance editor is unchanged, while a Plus artist who set a
  // bookingForm override finally gets it applied here instead of silently
  // losing to the legacy read.
  const coverImage = appearance.resolved.backgroundImageUrl;
  const coverColor = accentHex(appearance.resolved.accent, COVER_COLORS);
  // Visual templates (P3b). Free resolves to `clean` server-side, and `clean`
  // is byte-identical to the classes this page carried inline before, so an
  // un-entitled artist's page is unchanged.
  const tpl = bookingTemplateStyles(appearance.resolved.template);

  // Bio Page settings — the custom LINKS moved to the standalone Link Hub
  // (/<slug>/hub, ME-11); the booking page keeps only the booking-policy text
  // (shown to clients before they book) and the shop slot.
  const bioPage = parseBioPageSettings(profileSettings.bio_page);

  // Public shop products (Slice 73). Only queried when the shop module is
  // visible. Sold-out products still show (greyed). Cards are informational
  // unless `interestEligible` (active + flagged as appointment add-on + EUR) —
  // those gain interest-marking controls so the client can signal "I want to
  // buy this at the appointment" before the artist accepts the request.
  let shopProducts: PublicProduct[] = [];
  let shopCollections: ProductCollection[] = [];
  let shopMemberships: CollectionMembership[] = [];
  let shopBundles: PublicBundle[] = [];
  // Surface content (founder ruling FD10, 2026-08-01): the SAME "shop"
  // surface record the standalone checkout page reads. The teaser is a
  // compact preview of the same shop, not an independent content surface,
  // so one artist-authored intro line / featured selection covers both
  // places goods content renders.
  let shopIntroText: string | null = null;
  let shopFeaturedCollections: FeaturedCollectionSummary[] = [];
  if (isModuleVisible(bioPage, "shop") && canUseGoods(profileSettings)) {
    const { data: rawProducts } = await serviceClient
      .from("products")
      // Column list lives with the PublicProduct type it populates, so a
      // dropped column is a red test rather than a field that silently goes
      // undefined and a surface that silently stops disclosing (counsel Q5).
      .select(PUBLIC_SHOP_PRODUCT_SELECT)
      .eq("artist_id", profile.id)
      .eq("is_public_visible", true)
      .in("status", ["active", "sold_out"])
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    type RawVariant = {
      id: string;
      name: string;
      price_amount_override: string | number | null;
      stock_quantity: number | null;
      status: string;
      sort_order: number;
    };
    type RawProduct = {
      id: string;
      title: string;
      category: string;
      image_url: string | null;
      image_urls: string[] | null;
      price_amount: string | number;
      currency: string | null;
      status: string;
      pickup_note: string | null;
      is_checkout_addon: boolean;
      quantity: number | null;
      available_from: string | null;
      preorder: boolean | null;
      collection_id: string | null;
      custom_made: boolean | null;
      product_variants: RawVariant[] | null;
    };

    const rows = (rawProducts ?? []) as unknown as RawProduct[];
    // GATE 2 of 3 for drops (P5c). Unlike the payable catalogue, an upcoming
    // product is deliberately KEPT here and labelled: announcing a drop is the
    // whole point, and hiding it until the moment it opens would defeat the
    // feature. It is simply not purchasable until then.
    // Bound to ONE instant for the whole page, in a server module: reading the
    // clock during render is an impure call, and evaluating each card against
    // its own millisecond could show a drop as open on one and closed on the
    // next.
    // Collections (P5d). One call, because the entitlement check, the kill
    // switch and the visible/archived filtering all belong together with the
    // read they gate: an unentitled artist gets empty arrays, which render as
    // a flat shop with every product still purchasable. A downgrade to Free
    // removes the grouping, never the goods.
    const grouping = await publicCollectionsForArtist(
      serviceClient,
      profile.id,
    );
    shopCollections = grouping.collections;
    shopMemberships = grouping.memberships;

    // Bundles (Stage 3). Same fail-flat, entitlement-aware read as collections:
    // an unentitled artist or a read blip yields no bundle offers, never a
    // broken shop. Display-only until the payable checkout un-parks.
    shopBundles = await publicBundlesForArtist(serviceClient, profile.id);

    const resolveAvailability = shopAvailabilityResolver();
    shopProducts = rows.map((p) => {
      const currency = typeof p.currency === "string" ? p.currency : "eur";
      const { availability, label: availabilityBadge } = resolveAvailability(p);
      // image_urls is canonical post-0038; fall back to legacy image_url so
      // any row that hasn't been re-saved still renders.
      const imageUrls =
        Array.isArray(p.image_urls) && p.image_urls.length > 0
          ? p.image_urls
          : p.image_url
            ? [p.image_url]
            : [];
      return {
        id: p.id,
        title: p.title,
        category: isProductCategory(p.category) ? p.category : "other",
        imageUrls,
        imageUrl: imageUrls[0] ?? null,
        price: toPriceNumber(p.price_amount),
        currency,
        soldOut: availability.state === "sold_out",
        // Counsel Q5. Normalised to a real boolean here rather than passed
        // through as `boolean | null`, so the render sites cannot disagree
        // about what a null column means.
        customMade: p.custom_made === true,
        collectionId: p.collection_id,
        availabilityState:
          availability.state === "unavailable" ? undefined : availability.state,
        availabilityLabel: availabilityBadge,
        pickupNote: p.pickup_note,
        // Interest is a signal, not a checkout commitment — any visible,
        // active, EUR product can be flagged. Decoupled from paid checkout
        // (78a/DT-11): interest-marking rides on the goods module being on,
        // NOT on `isGoodsCommerceEnabled()` (that flag still parks only the
        // payable add-on path). The deposit-time checkout still gates on
        // is_checkout_addon + the commerce flag separately.
        // An upcoming product cannot be flagged as wanted either: the artist
        // has not opened it yet, and an approved interest would be a promise
        // about something not on sale.
        interestEligible:
          canUseGoods(profileSettings) &&
          availability.purchasable &&
          currency === "eur",
        variants: [...(p.product_variants ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .filter((v) => v.status === "active")
          .map((v) => ({
            id: v.id,
            name: v.name,
            priceOverride:
              v.price_amount_override !== null &&
              v.price_amount_override !== undefined
                ? toPriceNumber(v.price_amount_override)
                : null,
            stock: v.stock_quantity,
          })),
      };
    });

    const surfaceContent = await resolvedSurfaceContent(
      profile.id as string,
      profileSettings,
      "shop",
    );
    shopIntroText = surfaceContent.introText;
    if (surfaceContent.featuredCollectionIds.length > 0) {
      const visibleProductIds = new Set(shopProducts.map((p) => p.id));
      shopFeaturedCollections = resolveFeaturedCollections(
        surfaceContent.featuredCollectionIds,
        shopCollections,
        shopMemberships,
        visibleProductIds,
      );
    }
  }

  const { data: rawCustomFields } = await serviceClient
    .from("custom_fields")
    .select("*")
    .eq("artist_id", profile.id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  // Parse the stored condition jsonb through the shared normalizer (P3): an
  // unparsed row would carry an arbitrary object where a FieldCondition is
  // expected, and visibility would evaluate against unvalidated shape.
  customFields = await applyConditionEntitlement(
    profile.id as string,
    (rawCustomFields ?? []).map((r) =>
      normalizeFieldRow(r as Record<string, unknown>),
    ),
  );

  const fieldOrder: string[] = Array.isArray(profileSettings.field_order)
    ? (profileSettings.field_order as string[])
    : buildDefaultFieldOrder(customFields.map((f) => f.id));

  let rawSlots: Array<{
    id: string;
    starts_at: string;
    duration_minutes: number;
  }> = [];
  if (isSlotMode) {
    const { data } = await serviceClient
      .from("slots")
      .select("id, starts_at, duration_minutes")
      .eq("artist_id", profile.id)
      .eq("status", "open")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });
    rawSlots = data ?? [];
  }

  const todayStr = todayInTimeZone(profile.timezone ?? "Europe/Berlin");

  // Fetch all visible trips with their legs
  const { data: rawTrips } = await serviceClient
    .from("trips")
    .select(
      "id, title, description, show_on_booking_form, trip_legs(id, starts_on, ends_on, studio_id, studios(name, city, country, visibility_mode, public_note, google_maps_url))",
    )
    .eq("artist_id", profile.id)
    .eq("show_on_booking_form", true);

  type RawStudio = {
    name: string;
    city: string;
    country: string;
    visibility_mode: string;
    public_note: string | null;
    google_maps_url: string | null;
  };
  type RawLeg = {
    id: string;
    starts_on: string;
    ends_on: string;
    studio_id: string | null;
    studios: RawStudio | RawStudio[] | null;
  };
  type RawTrip = {
    id: string;
    title: string;
    description: string | null;
    show_on_booking_form: boolean;
    trip_legs: RawLeg[];
  };

  const visibleTrips = (rawTrips as unknown as RawTrip[]) ?? [];

  // Public-facing location label for a leg's studio, honoring visibility_mode:
  // exact-address studios show "Name · City, Country", city-only studios show
  // "City, Country", hidden studios (or none set) show nothing.
  const studioLabelFromLeg = (
    studios: RawStudio | RawStudio[] | null,
  ): string | null => {
    const studio = Array.isArray(studios) ? (studios[0] ?? null) : studios;
    if (!studio || studio.visibility_mode === "hidden") return null;
    const cityLine = [studio.city, studio.country].filter(Boolean).join(", ");
    return studio.visibility_mode === "public_exact_address"
      ? `${studio.name} · ${cityLine}`
      : cityLine || null;
  };

  // Active trip: a trip that has at least one leg spanning today
  const activeTrip =
    visibleTrips.find((t) =>
      t.trip_legs.some((l) => l.starts_on <= todayStr && l.ends_on >= todayStr),
    ) ?? null;

  const activeLeg = activeTrip
    ? (activeTrip.trip_legs.find(
        (l) => l.starts_on <= todayStr && l.ends_on >= todayStr,
      ) ?? null)
    : null;

  const activeLegStudio = activeLeg
    ? Array.isArray(activeLeg.studios)
      ? (activeLeg.studios[0] ?? null)
      : activeLeg.studios
    : null;
  const activeLegData =
    activeLeg && activeTrip
      ? {
          startsOn: activeLeg.starts_on,
          endsOn: activeLeg.ends_on,
          studioName: activeLegStudio?.name ?? null,
          studioMapsUrl: activeLegStudio?.google_maps_url ?? null,
        }
      : null;

  // Future trips for the booking form selector — include leg date ranges so the
  // client can filter locations by the chosen preferred date.
  const futureTrips = visibleTrips
    .filter((t) => t.trip_legs.some((l) => l.ends_on >= todayStr))
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      // Include only legs that haven't fully ended yet
      legs: t.trip_legs
        .filter((l) => l.ends_on >= todayStr)
        .map((l) => ({
          startsOn: l.starts_on,
          endsOn: l.ends_on,
          locationLabel: studioLabelFromLeg(l.studios),
        })),
    }));

  // Load primary public studio (never call Google API — read from saved data)
  const { data: primaryStudio } = await serviceClient
    .from("studios")
    .select(
      "id, name, city, country, formatted_address, address, google_maps_url, visibility_mode, public_note",
    )
    .eq("artist_id", profile.id)
    .eq("is_primary", true)
    .neq("visibility_mode", "hidden")
    .maybeSingle();

  // Enrich slots with location info derived from overlapping trip legs.
  // Falls back to the artist's primary public studio city for slots that sit
  // outside any trip (home-base slots). Respects studio visibility_mode.
  if (isSlotMode) {
    const tz = profile.timezone ?? "Europe/Berlin";
    slots = rawSlots.map((s) => {
      const display = formatSlotDisplay(s.starts_at, s.duration_minutes, tz);
      const slotDateKey = dateKeyInTimeZone(s.starts_at, tz);

      let location: SlotOption["location"] | undefined;
      outer: for (const trip of visibleTrips) {
        for (const leg of trip.trip_legs) {
          if (slotDateKey >= leg.starts_on && slotDateKey <= leg.ends_on) {
            const label = studioLabelFromLeg(leg.studios);
            if (label) location = { label, tripTitle: trip.title };
            break outer;
          }
        }
      }

      if (!location && primaryStudio) {
        const cityLine = [primaryStudio.city, primaryStudio.country]
          .filter(Boolean)
          .join(", ");
        if (cityLine) location = { label: cityLine };
      }

      return {
        id: s.id,
        date: display.date,
        time: display.time,
        tz: display.tz,
        ...(location ? { location } : {}),
      };
    });
  }

  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  // One shared derivation (same as the booking-submit gate + mobile /me, /home):
  // an expired booking window keeps the books closed even while the flag is on.
  const { booksOpen, windowExpired, notYetOpen } = deriveBooksOpen(
    booksSettings,
    todayInTimeZone(profile.timezone ?? "Europe/Berlin"),
  );
  // isManualClose is the raw flag alone (drives the "books closed" message);
  // isManuallyClosed folds in the expired window (== !effective-open).
  const isManualClose = !booksSettings.books_open;
  const isManuallyClosed = !booksOpen;
  const isSlotsClosed = isSlotMode && slots.length === 0;

  let isCapReached = false;
  if (
    booksSettings.booking_cap !== null &&
    !isManuallyClosed &&
    !isSlotsClosed
  ) {
    const { count } = await serviceClient
      .from("booking_requests")
      .select("*", { count: "exact", head: true })
      .eq("artist_id", profile.id)
      .in("status", ["pending", "approved", "deposit_pending"]);
    isCapReached = (count ?? 0) >= booksSettings.booking_cap;
  }

  const isClosed = isManuallyClosed || isSlotsClosed || isCapReached;

  // Reason-specific closed-book copy (D19). Precedence:
  // window expired > manual close > fixed-slots-no-slots > cap reached.
  const artistFirstName = profile.display_name.split(" ")[0];
  let closedMessage = "Books are currently closed.";
  let closedHint: string | undefined = "Check back soon.";
  // A scheduled open date takes precedence over every other reason: it is the
  // only one that tells the visitor exactly when to come back, which is the
  // whole point of announcing it.
  if (notYetOpen && booksSettings.booking_opens_at) {
    closedMessage = `Books open on ${formatDateKey(
      booksSettings.booking_opens_at,
    )}.`;
    closedHint = "Join the waitlist to hear first.";
  } else if (windowExpired && booksSettings.booking_window_ends_at) {
    closedMessage = `Books were open until ${formatDateKey(
      booksSettings.booking_window_ends_at,
    )} and are now closed.`;
  } else if (isManualClose) {
    closedMessage =
      booksSettings.books_closed_message ?? "Books are currently closed.";
  } else if (isSlotsClosed) {
    closedMessage = `${artistFirstName} hasn't posted slots yet.`;
    closedHint = "Check back soon.";
  } else if (isCapReached) {
    closedMessage = `${artistFirstName} is fully booked for now.`;
    closedHint = undefined;
  }

  // Header style: image > color > default charcoal
  const headerStyle: React.CSSProperties = coverImage
    ? {
        backgroundImage: `url(${coverImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : coverColor
      ? { backgroundColor: coverColor }
      : {};

  // Goods overlay cards match the chosen header color; charcoal when the header
  // is a cover image (or no color set).
  const goodsItemBg = !coverImage && coverColor ? coverColor : null;

  // Footer + consent links leave the artist namespace for apex-only routes
  // (legal pages, marketing home), so they must be host-aware: a relative
  // /terms on <slug>.inkl.ee would be slug-prefixed by the proxy and 404.
  const termsHref = await apexHref("/terms");
  const privacyHref = await apexHref("/privacy");
  const imprintHref = await apexHref("/imprint");
  const acceptableUseHref = await apexHref("/acceptable-use");
  const homeHref = await apexHref("/");

  return (
    <InterestSelectionsProvider>
      <div className="flex min-h-screen flex-col bg-brand-charcoal text-brand-bone">
        <header className={tpl.header} style={headerStyle}>
          {coverImage && (
            <div
              aria-hidden
              className="absolute inset-0 bg-brand-charcoal/55"
            />
          )}
          <div className={tpl.headerInner}>
            {profile.logo_url && (
              <div className={tpl.logo}>
                <Image
                  src={profile.logo_url}
                  alt={profile.display_name}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div className="space-y-1">
              <h1 className={tpl.name}>{profile.display_name}</h1>
              {(profile.location || profile.instagram_handle) && (
                <div className={tpl.meta}>
                  {profile.location && <span>{profile.location}</span>}
                  {profile.location && profile.instagram_handle && (
                    <span aria-hidden>·</span>
                  )}
                  {profile.instagram_handle && (
                    <a
                      href={`https://instagram.com/${profile.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-brand-bone"
                    >
                      @{profile.instagram_handle}
                    </a>
                  )}
                </div>
              )}
            </div>
            {profile.bio && <p className={tpl.bio}>{profile.bio}</p>}
            {(futureTrips.length > 0 || shopProducts.length > 0) && (
              <div className={tpl.chips}>
                {futureTrips.length > 0 && <TravelCard trips={futureTrips} />}
                {shopProducts.length > 0 && (
                  <ShopTeaser
                    products={shopProducts}
                    collections={shopCollections}
                    memberships={shopMemberships}
                    bundles={shopBundles}
                    itemBg={goodsItemBg}
                    artistName={profile.display_name}
                    introText={shopIntroText}
                    featuredCollections={shopFeaturedCollections}
                  />
                )}
              </div>
            )}
            {activeLegData && (
              <p className="pt-1.5 text-sm text-brand-bone/65">
                {formatDateKey(activeLegData.startsOn, {
                  day: "numeric",
                  month: "short",
                })}
                {" — "}
                {formatDateKey(activeLegData.endsOn, {
                  day: "numeric",
                  month: "short",
                })}
                {activeLegData.studioName && (
                  <>
                    {" · "}
                    {activeLegData.studioMapsUrl ? (
                      <a
                        href={activeLegData.studioMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-bone underline underline-offset-2 transition-colors hover:text-brand-bone/80"
                      >
                        {activeLegData.studioName}
                      </a>
                    ) : (
                      <span className="font-medium text-brand-bone">
                        {activeLegData.studioName}
                      </span>
                    )}
                  </>
                )}
              </p>
            )}
          </div>
        </header>

        <main
          // The panel background is ALWAYS bone (--color-workspace-bg), so the
          // text variables must come from [data-appearance="light"]. A "dark"
          // form_appearance has no matching CSS block yet (globals.css only
          // defines [data-appearance="light"] and "auto" light-only), so reading
          // it produced bone text on bone background — invisible. Clamp to
          // "light" until a dark panel design + CSS block exist.
          data-appearance="light"
          style={appearance.cssVars as React.CSSProperties}
          className={tpl.panel}
        >
          <div className={tpl.panelInner}>
            <div className="space-y-6">
              <div>
                <h2 className={tpl.heading}>Booking request</h2>
                <p className={tpl.subheading}>
                  Fill in the details and I&apos;ll get back to you.
                </p>
              </div>

              {isClosed ? (
                <BooksClosedBlock message={closedMessage} hint={closedHint}>
                  <WaitlistForm artistSlug={slug} />
                </BooksClosedBlock>
              ) : (
                <BookingForm
                  artistSlug={slug}
                  artistFirstName={profile.display_name.split(" ")[0]}
                  bookingMode={profile.booking_mode ?? "preferred_date"}
                  slots={slots}
                  customFields={customFields}
                  formSettings={formSettings}
                  fieldOrder={fieldOrder}
                  trips={futureTrips}
                  isDemoAccount={slug === "bert-grimm"}
                  studioId={primaryStudio?.id ?? null}
                  termsHref={termsHref}
                  privacyHref={privacyHref}
                  acceptableUseHref={acceptableUseHref}
                />
              )}
            </div>

            {/* Booking policy (shown to clients before they book). Custom links
              moved to the Link Hub; shop renders as a teaser in the header. */}
            {isModuleVisible(bioPage, "policy") && bioPage.bookingPolicy ? (
              <BookingPolicyBlock policy={bioPage.bookingPolicy} />
            ) : null}
          </div>
        </main>

        <footer className="flex flex-wrap justify-center gap-x-4 gap-y-2 bg-brand-charcoal px-6 py-6 text-xs text-brand-bone/40">
          <Link
            href={termsHref}
            className="transition-colors hover:text-brand-bone"
          >
            Terms
          </Link>
          <Link
            href={privacyHref}
            className="transition-colors hover:text-brand-bone"
          >
            Privacy
          </Link>
          <Link
            href={imprintHref}
            className="transition-colors hover:text-brand-bone"
          >
            Imprint
          </Link>
          {!hideBranding && (
            <>
              <span aria-hidden>·</span>
              <Link
                href={homeHref}
                className="transition-colors hover:text-brand-bone"
              >
                Powered by inklee
              </Link>
            </>
          )}
        </footer>
      </div>
    </InterestSelectionsProvider>
  );
}
