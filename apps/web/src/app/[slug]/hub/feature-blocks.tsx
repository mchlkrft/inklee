import Image from "next/image";
import { CalendarCheck, Plane, Sparkles, ShoppingBag } from "lucide-react";
import type {
  BioFeatureBlockType,
  BioGalleryImage,
} from "@/lib/bio-page-settings";
import type { TemplateStyles } from "@inklee/shared/page-template-styles";

// Hub feature blocks (Plus build P2b). Each renders data the artist already
// maintains elsewhere, and each returns NULL when that data is empty, so an
// added-but-unused block never leaves a bare heading on a public page.
//
// These are deliberately compact and OUTBOUND: the hub is a link-in-bio
// surface whose job is routing, so a block summarises and links to the real
// page rather than reimplementing it. The booking page keeps the full shop,
// travel and flash experiences.

export type HubFeatureData = {
  booksOpen: boolean;
  bookingUrl: string;
  productCount: number;
  productThumbs: string[];
  tripCount: number;
  nextTripLabel: string | null;
  flashCount: number;
  /** Keyed by collection id. A collection ABSENT from this map is one the
   *  artist featured but which is now hidden, archived, empty of purchasable
   *  products, unentitled, or simply gone. All of those render as no block. */
  featuredCollections: Record<
    string,
    { name: string; productCount: number; thumbs: string[] }
  >;
};

function SectionHeading({
  children,
  tpl,
}: {
  children: React.ReactNode;
  tpl: TemplateStyles;
}) {
  return <p className={`pt-2 ${tpl.headline}`}>{children}</p>;
}

/** A featured shop collection (P5d). Unlike the blocks below it this one
 *  carries a reference, so it takes the id rather than reading a fixed key. The
 *  name and contents are read live: renaming or rearranging the collection is
 *  reflected here with nothing to re-save on the Hub. */
export function HubFeaturedCollectionBlock({
  collectionId,
  data,
  tpl,
  shopUrl,
}: {
  collectionId: string;
  data: HubFeatureData;
  tpl: TemplateStyles;
  shopUrl: string;
}) {
  const collection = data.featuredCollections[collectionId];
  // The one behaviour that matters: a dangling or emptied reference renders
  // NOTHING. An artist who archives a collection must not discover a broken
  // section on their public page.
  if (!collection) return null;

  return (
    <a
      href={shopUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-2xl border border-brand-bone/20 p-4 transition-colors hover:border-brand-bone/40"
    >
      <SectionHeading tpl={tpl}>
        <span className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" aria-hidden />
          {collection.name}
        </span>
      </SectionHeading>
      {collection.thumbs.length > 0 && (
        <span className="mt-3 flex gap-2">
          {collection.thumbs.map((src) => (
            <span
              key={src}
              className="relative h-14 w-14 overflow-hidden rounded-md bg-brand-bone/10"
            >
              <Image src={src} alt="" fill className="object-cover" />
            </span>
          ))}
        </span>
      )}
      <span className="mt-2 block text-xs text-brand-bone/60">
        {collection.productCount === 1
          ? "1 item"
          : `${collection.productCount} items`}
      </span>
    </a>
  );
}

/** A Plus rich block: the artist's own images (Stage 3). Self-contained (the
 *  images live on the block, unlike the reference/feature blocks), so it takes
 *  no HubFeatureData. The caller renders it only for an entitled artist. Images
 *  are artist-provided absolute URLs on arbitrary domains, so they use
 *  `unoptimized` (the Next image optimizer's domain allowlist does not apply). */
export function HubImageGalleryBlock({
  images,
  layout,
  tpl,
}: {
  images: BioGalleryImage[];
  layout: "grid" | "carousel";
  tpl: TemplateStyles;
}) {
  // Defensive: the parser drops an empty gallery, so this is belt-and-braces.
  if (images.length === 0) return null;

  const figure = (img: BioGalleryImage, key: string, extra: string) => (
    <figure key={key} className={extra}>
      <span className="relative block aspect-square overflow-hidden rounded-lg bg-brand-bone/10">
        <Image
          src={img.url}
          alt={img.alt ?? img.caption ?? ""}
          fill
          unoptimized
          sizes="(max-width: 640px) 33vw, 200px"
          className="object-cover"
        />
      </span>
      {img.caption && (
        <figcaption className="mt-1 truncate text-xs text-brand-bone/60">
          {img.caption}
        </figcaption>
      )}
    </figure>
  );

  if (layout === "carousel") {
    return (
      <section
        aria-label="Image gallery"
        className={`flex snap-x gap-2 overflow-x-auto pb-1 ${tpl.socials ?? ""}`}
      >
        {images.map((img, i) =>
          figure(img, `${img.url}-${i}`, "w-36 shrink-0 snap-start"),
        )}
      </section>
    );
  }

  return (
    <section aria-label="Image gallery" className="grid grid-cols-3 gap-2">
      {images.map((img, i) => figure(img, `${img.url}-${i}`, ""))}
    </section>
  );
}

export function HubFeatureBlock({
  type,
  data,
  tpl,
}: {
  type: BioFeatureBlockType;
  data: HubFeatureData;
  tpl: TemplateStyles;
}) {
  if (type === "booking_form") {
    return (
      <a
        href={data.bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand-mustard px-5 py-4 text-sm font-semibold text-brand-charcoal shadow-sm transition-transform hover:-translate-y-0.5"
      >
        <CalendarCheck className="h-4 w-4" aria-hidden />
        {data.booksOpen ? "Book a tattoo" : "See booking details"}
      </a>
    );
  }

  if (type === "books_status") {
    return (
      <div
        className={`flex items-center gap-2 rounded-full border border-brand-bone/25 px-4 py-2 text-sm text-brand-bone/85 ${
          tpl.centered ? "justify-center" : "justify-start"
        }`}
      >
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${
            data.booksOpen ? "bg-brand-green" : "bg-brand-bone/40"
          }`}
        />
        {data.booksOpen ? "Books are open" : "Books are closed"}
      </div>
    );
  }

  if (type === "goods") {
    if (data.productCount === 0) return null;
    return (
      <a
        href={data.bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-2xl border border-brand-bone/20 p-4 transition-colors hover:border-brand-bone/40"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-brand-bone">
          <ShoppingBag className="h-4 w-4" aria-hidden />
          Shop
        </span>
        {data.productThumbs.length > 0 && (
          <span className="mt-3 flex gap-2">
            {data.productThumbs.map((src) => (
              <span
                key={src}
                className="relative h-14 w-14 overflow-hidden rounded-md bg-brand-bone/10"
              >
                <Image src={src} alt="" fill className="object-cover" />
              </span>
            ))}
          </span>
        )}
        <span className="mt-2 block text-xs text-brand-bone/60">
          {data.productCount === 1 ? "1 item" : `${data.productCount} items`}
        </span>
      </a>
    );
  }

  if (type === "guest_spots") {
    if (data.tripCount === 0) return null;
    return (
      <div className="rounded-2xl border border-brand-bone/20 p-4">
        <SectionHeading tpl={tpl}>
          <span className="flex items-center gap-2">
            <Plane className="h-4 w-4" aria-hidden />
            Guest spots
          </span>
        </SectionHeading>
        {data.nextTripLabel && (
          <p className="mt-1 text-sm text-brand-bone/75">
            {data.nextTripLabel}
          </p>
        )}
        <p className="mt-1 text-xs text-brand-bone/60">
          {data.tripCount === 1
            ? "1 trip planned"
            : `${data.tripCount} trips planned`}
        </p>
      </div>
    );
  }

  // flash
  if (data.flashCount === 0) return null;
  return (
    <a
      href={`${data.bookingUrl}/flash`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-2xl border border-brand-bone/20 px-4 py-3.5 transition-colors hover:border-brand-bone/40"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-brand-bone">
        <Sparkles className="h-4 w-4" aria-hidden />
        Available flash
      </span>
      <span className="text-xs text-brand-bone/60">
        {data.flashCount === 1 ? "1 design" : `${data.flashCount} designs`}
      </span>
    </a>
  );
}
