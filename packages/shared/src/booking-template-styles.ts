// Booking-page template style maps (Plus build P3b).
//
// The same four templates the Linkhub uses (plus-product-spec.md section 3),
// applied to the public artist page: header band, identity block, and the
// request panel below it. As with the hub, this is ONE scaffold with four
// class maps rather than four page components. Four independent layouts would
// be four things to keep correct every time the form gains a field, a chip row
// or a closed state, and they would drift within a release.
//
// `clean` is byte-identical to what the page renders today, so a Free artist
// (whose resolved template is always `clean`, enforced server-side by
// freeTierView) sees no change at all.
//
// Pure and framework-free, like page-template-styles.ts, so the vocabulary
// cannot fork between web and the native preview.

import type { PageTemplate } from "./appearance";

export type BookingTemplateStyles = {
  /** Header band wrapping the cover image / colour. */
  header: string;
  /** Identity column inside the header. */
  headerInner: string;
  /** Artist logo. */
  logo: string;
  /** Display name. */
  name: string;
  /** Meta line (location, Instagram handle). */
  meta: string;
  /** Bio paragraph. */
  bio: string;
  /** Travel / shop chip row. */
  chips: string;
  /** The request panel that overlaps the header. */
  panel: string;
  /** Content column inside the panel. */
  panelInner: string;
  /** "Booking request" heading. */
  heading: string;
  /** Line under the heading. */
  subheading: string;
  /** Drives alignment of anything the class maps above do not cover. */
  centered: boolean;
};

export const BOOKING_TEMPLATE_STYLES: Record<
  PageTemplate,
  BookingTemplateStyles
> = {
  // Today's page, unchanged. Every class here is copied from the render, not
  // re-derived: this row is the regression guard for every existing artist.
  clean: {
    header: "relative px-6 pt-12 pb-16",
    headerInner:
      "relative z-10 mx-auto flex max-w-lg flex-col items-center space-y-3 text-center",
    logo: "relative h-28 w-28 overflow-hidden rounded-full ring-2 ring-brand-bone/25",
    name: "text-2xl font-semibold tracking-tight text-brand-bone",
    meta: "flex items-center justify-center gap-2 text-sm text-brand-bone/65",
    bio: "max-w-sm text-sm leading-relaxed text-brand-bone/70",
    chips: "flex flex-wrap items-center justify-center gap-2 pt-1",
    panel:
      "relative -mt-8 flex-1 rounded-t-[28px] bg-[color:var(--color-workspace-bg)] px-6 pt-10 pb-12 text-foreground md:px-8",
    panelInner: "mx-auto w-full max-w-lg space-y-8",
    heading: "text-xl font-semibold tracking-tight text-foreground",
    subheading: "mt-1 text-sm text-muted-foreground",
    centered: true,
  },

  // Work first: a taller header so a cover image reads as imagery rather than
  // a band, a larger square logo, and a wider panel.
  portfolio: {
    header: "relative px-6 pt-20 pb-24",
    headerInner:
      "relative z-10 mx-auto flex max-w-xl flex-col items-center space-y-4 text-center",
    logo: "relative h-32 w-32 overflow-hidden rounded-2xl ring-1 ring-brand-bone/20",
    name: "text-3xl font-semibold tracking-tight text-brand-bone",
    meta: "flex items-center justify-center gap-2 text-sm text-brand-bone/65",
    bio: "max-w-lg text-sm leading-relaxed text-brand-bone/70",
    chips: "flex flex-wrap items-center justify-center gap-2 pt-1",
    panel:
      "relative -mt-10 flex-1 rounded-t-[32px] bg-[color:var(--color-workspace-bg)] px-6 pt-12 pb-12 text-foreground md:px-10",
    panelInner: "mx-auto w-full max-w-xl space-y-8",
    heading: "text-xl font-semibold tracking-tight text-foreground",
    subheading: "mt-1 text-sm text-muted-foreground",
    centered: true,
  },

  // High contrast, large type, hard edges.
  bold: {
    header: "relative px-6 pt-14 pb-20",
    headerInner:
      "relative z-10 mx-auto flex max-w-lg flex-col items-center space-y-4 text-center",
    logo: "relative h-28 w-28 overflow-hidden rounded-full ring-4 ring-brand-bone/40",
    name: "text-4xl font-bold uppercase tracking-tight text-brand-bone",
    meta: "flex items-center justify-center gap-2 text-sm uppercase tracking-wide text-brand-bone/70",
    bio: "max-w-md text-base leading-relaxed text-brand-bone/80",
    chips: "flex flex-wrap items-center justify-center gap-2 pt-1",
    panel:
      "relative -mt-6 flex-1 rounded-none border-t-4 border-brand-bone bg-[color:var(--color-workspace-bg)] px-6 pt-10 pb-12 text-foreground md:px-8",
    panelInner: "mx-auto w-full max-w-lg space-y-8",
    heading: "text-2xl font-bold uppercase tracking-tight text-foreground",
    subheading: "mt-1 text-sm text-muted-foreground",
    centered: true,
  },

  // Left-aligned, magazine feel. The only template that is not centred, which
  // is why `centered` exists rather than being inferred from a class string.
  editorial: {
    header: "relative px-6 pt-14 pb-16",
    headerInner:
      "relative z-10 mx-auto flex max-w-lg flex-col items-start space-y-3 text-left",
    logo: "relative h-20 w-20 overflow-hidden rounded-full ring-1 ring-brand-bone/20",
    name: "text-3xl font-semibold tracking-tight text-brand-bone",
    meta: "flex items-center gap-2 text-sm text-brand-bone/65",
    bio: "max-w-md text-sm leading-relaxed text-brand-bone/70",
    chips: "flex flex-wrap items-center justify-start gap-2 pt-1",
    panel:
      "relative -mt-8 flex-1 rounded-t-[28px] bg-[color:var(--color-workspace-bg)] px-6 pt-10 pb-12 text-foreground md:px-8",
    panelInner: "mx-auto w-full max-w-lg space-y-8",
    heading:
      "text-xl font-semibold tracking-tight text-foreground border-b border-border pb-2",
    subheading: "mt-2 text-sm text-muted-foreground",
    centered: false,
  },
};

export function bookingTemplateStyles(t: PageTemplate): BookingTemplateStyles {
  return BOOKING_TEMPLATE_STYLES[t] ?? BOOKING_TEMPLATE_STYLES.clean;
}
