import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import BookingForm from "./booking-form";
import BooksClosedBlock from "./books-closed-block";
import WaitlistForm from "./waitlist-form";
import BookingPolicyBlock from "./booking-policy-block";
import CustomLinksBlock from "./custom-links-block";
import ShopTeaser from "./shop-teaser";
import TravelCard from "./travel-card";
import { InterestSelectionsProvider } from "./interest-selections-context";
import { formatSlotDisplay } from "@/lib/timezone";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { parseFormSettings, buildDefaultFieldOrder } from "@/lib/form-settings";
import { parseBooksSettings } from "@/lib/books-settings";
import { serviceClient } from "@/lib/supabase/service";
import {
  dateKeyInTimeZone,
  formatDateKey,
  isDateKeyBefore,
  todayInTimeZone,
} from "@/lib/date-utils";
import { clampDescription } from "@/lib/seo";
import { publicArtistUrl } from "@/lib/public-url";
import {
  parseBioPageSettings,
  visibleModules,
  isModuleVisible,
} from "@/lib/bio-page-settings";
import {
  isProductCategory,
  toPriceNumber,
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

// Brand-color name → hex map for cover_color in profile.settings.
// Artists can also pass a raw hex like "#0b3d9f".
const BRAND_COLOR_HEX: Record<string, string> = {
  mustard: "#e9b22b",
  rosa: "#db88b9",
  cobalt: "#0b3d9f",
  red: "#cf2e2c",
  green: "#105f2d",
  charcoal: "#1e1e1e",
  bone: "#e5e1d5",
};

function resolveCoverColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v in BRAND_COLOR_HEX) return BRAND_COLOR_HEX[v];
  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;
  return null;
}

function resolveCoverImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  // Permit only https://, http:// (local dev), and protocol-relative URLs.
  // No data: or javascript: URIs.
  if (
    !v.startsWith("https://") &&
    !v.startsWith("http://") &&
    !v.startsWith("//")
  ) {
    return null;
  }
  return v;
}

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
    title: `${name} — Tattoo Booking · Inklee`,
    description,
    alternates: { canonical },
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
    .single();

  if (!profile) notFound();

  const isSlotMode = profile.booking_mode === "fixed_slots";
  let slots: SlotOption[] = [];
  let customFields: CustomFieldDef[] = [];
  const profileSettings = (profile.settings ?? {}) as Record<string, unknown>;
  const formSettings = parseFormSettings(profileSettings.form_settings);

  const coverImage = resolveCoverImage(profileSettings.cover_image_url);
  const coverColor = resolveCoverColor(profileSettings.cover_color);

  // Bio Page modules (Slice 72) — optional sections rendered below the booking
  // section. Defaults to nothing configured, so existing pages are unchanged.
  const bioPage = parseBioPageSettings(profileSettings.bio_page);
  const activeLinks = bioPage.customLinks.filter((l) => l.isActive);

  // Public shop products (Slice 73). Only queried when the shop module is
  // visible. Sold-out products still show (greyed). Cards are informational
  // unless `interestEligible` (active + flagged as appointment add-on + EUR) —
  // those gain interest-marking controls so the client can signal "I want to
  // buy this at the appointment" before the artist accepts the request.
  let shopProducts: PublicProduct[] = [];
  if (isModuleVisible(bioPage, "shop") && canUseGoods(profileSettings)) {
    const { data: rawProducts } = await serviceClient
      .from("products")
      .select(
        "id, title, category, image_url, price_amount, currency, status, pickup_note, is_checkout_addon, product_variants(id, name, price_amount_override, stock_quantity, status, sort_order)",
      )
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
      price_amount: string | number;
      currency: string | null;
      status: string;
      pickup_note: string | null;
      is_checkout_addon: boolean;
      product_variants: RawVariant[] | null;
    };

    const rows = (rawProducts ?? []) as unknown as RawProduct[];
    shopProducts = rows.map((p) => {
      const currency = typeof p.currency === "string" ? p.currency : "eur";
      return {
        id: p.id,
        title: p.title,
        category: isProductCategory(p.category) ? p.category : "other",
        imageUrl: p.image_url,
        price: toPriceNumber(p.price_amount),
        currency,
        soldOut: p.status === "sold_out",
        pickupNote: p.pickup_note,
        interestEligible:
          p.is_checkout_addon === true &&
          p.status === "active" &&
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
  }

  const { data: rawCustomFields } = await serviceClient
    .from("custom_fields")
    .select("*")
    .eq("artist_id", profile.id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  customFields = (rawCustomFields as CustomFieldDef[]) ?? [];

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
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(
      booksSettings.booking_window_ends_at,
      todayInTimeZone(profile.timezone ?? "Europe/Berlin"),
    );

  const isManualClose = !booksSettings.books_open;
  const isManuallyClosed = isManualClose || windowExpired;
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
  if (windowExpired && booksSettings.booking_window_ends_at) {
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

  return (
    <InterestSelectionsProvider>
      <div className="flex min-h-screen flex-col bg-brand-charcoal text-brand-bone">
        <header className="relative px-6 pt-12 pb-16" style={headerStyle}>
          {coverImage && (
            <div
              aria-hidden
              className="absolute inset-0 bg-brand-charcoal/55"
            />
          )}
          <div className="relative z-10 mx-auto flex max-w-lg flex-col items-center space-y-3 text-center">
            {profile.logo_url && (
              <div className="relative h-28 w-28 overflow-hidden rounded-full ring-2 ring-brand-bone/25">
                <Image
                  src={profile.logo_url}
                  alt={profile.display_name}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-brand-bone">
                {profile.display_name}
              </h1>
              {(profile.location || profile.instagram_handle) && (
                <div className="flex items-center justify-center gap-2 text-sm text-brand-bone/65">
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
            {profile.bio && (
              <p className="max-w-sm text-sm leading-relaxed text-brand-bone/70">
                {profile.bio}
              </p>
            )}
            {(futureTrips.length > 0 || shopProducts.length > 0) && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {futureTrips.length > 0 && <TravelCard trips={futureTrips} />}
                {shopProducts.length > 0 && (
                  <ShopTeaser products={shopProducts} itemBg={goodsItemBg} />
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
          data-appearance="light"
          className="relative -mt-8 flex-1 rounded-t-[28px] bg-[color:var(--color-workspace-bg)] px-6 pt-10 pb-12 text-foreground md:px-8"
        >
          <div className="mx-auto w-full max-w-lg space-y-8">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Booking request
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
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
                />
              )}
            </div>

            {/* Bio Page modules — render below the booking section, in order,
              skipping any the artist hid. Booking stays the primary action. */}
            {visibleModules(bioPage).map((key) => {
              if (key === "links") {
                return <CustomLinksBlock key="links" links={activeLinks} />;
              }
              if (key === "policy") {
                return bioPage.bookingPolicy ? (
                  <BookingPolicyBlock
                    key="policy"
                    policy={bioPage.bookingPolicy}
                  />
                ) : null;
              }
              // Shop renders as a teaser above the booking form, not here.
              return null;
            })}
          </div>
        </main>

        <footer className="flex flex-wrap justify-center gap-x-4 gap-y-2 bg-brand-charcoal px-6 py-6 text-xs text-brand-bone/40">
          <Link
            href="/terms"
            className="transition-colors hover:text-brand-bone"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="transition-colors hover:text-brand-bone"
          >
            Privacy
          </Link>
          <Link
            href="/imprint"
            className="transition-colors hover:text-brand-bone"
          >
            Imprint
          </Link>
          <span aria-hidden>·</span>
          <Link href="/" className="transition-colors hover:text-brand-bone">
            Powered by inklee
          </Link>
        </footer>
      </div>
    </InterestSelectionsProvider>
  );
}
