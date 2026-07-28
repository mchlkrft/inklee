// Layout template style maps (Plus build P2).
//
// Each of the four confirmed templates (plus-product-spec.md section 3) is a
// set of class choices over the SAME hub scaffold, not a separate page. That
// is deliberate: four independent layouts would be four things to keep correct
// as blocks, socials and branding evolve, and they would drift. One scaffold
// with per-template classes means a new block type works in every template the
// day it ships.
//
// Pure and framework-free (web consumes these directly; the native preview can
// read the same descriptors), so the vocabulary cannot fork between platforms.

import type { PageTemplate } from "./appearance";

export type TemplateStyles = {
  /** Content column: alignment + max width. */
  main: string;
  /** Avatar / logo treatment. */
  avatar: string;
  /** Display name. */
  name: string;
  /** Meta line (location, handle). */
  meta: string;
  /** Bio / intro paragraph. */
  bio: string;
  /** Social icon row alignment. */
  socials: string;
  /** Link block. */
  link: string;
  /** Headline block. */
  headline: string;
  /** Text block. */
  text: string;
  /** Whether the template centres its content (drives text alignment). */
  centered: boolean;
};

export const PAGE_TEMPLATE_STYLES: Record<PageTemplate, TemplateStyles> = {
  // The default and the Free layout: exactly today's hub, so an existing page
  // renders byte-identically until an artist picks something else.
  clean: {
    main: "mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 pt-16 pb-10 text-center",
    avatar: "relative h-24 w-24 overflow-hidden rounded-full ring-2 ring-brand-bone/25",
    name: "mt-4 text-2xl font-semibold tracking-tight text-brand-bone",
    meta: "mt-1 flex items-center justify-center gap-2 text-sm text-brand-bone/65",
    bio: "mt-3 max-w-sm text-sm leading-relaxed text-brand-bone/75",
    socials: "justify-center",
    link: "w-full rounded-full bg-brand-bone px-5 py-3.5 text-center text-sm font-medium text-brand-charcoal",
    headline: "text-lg font-semibold text-brand-bone",
    text: "text-sm leading-relaxed text-brand-bone/75",
    centered: true,
  },

  // Work first: a wider column and a larger avatar so imagery dominates.
  portfolio: {
    main: "mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-6 pt-12 pb-10 text-center",
    avatar:
      "relative h-36 w-36 overflow-hidden rounded-2xl ring-1 ring-brand-bone/20",
    name: "mt-5 text-2xl font-semibold tracking-tight text-brand-bone",
    meta: "mt-1 flex items-center justify-center gap-2 text-sm text-brand-bone/65",
    bio: "mt-3 max-w-lg text-sm leading-relaxed text-brand-bone/75",
    socials: "justify-center",
    link: "w-full rounded-xl bg-brand-bone px-5 py-4 text-center text-sm font-medium text-brand-charcoal",
    headline: "text-lg font-semibold text-brand-bone",
    text: "text-sm leading-relaxed text-brand-bone/75",
    centered: true,
  },

  // High contrast, large type.
  bold: {
    main: "mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-6 pt-14 pb-10 text-center",
    avatar:
      "relative h-28 w-28 overflow-hidden rounded-full ring-4 ring-brand-bone/40",
    name: "mt-5 text-4xl font-bold uppercase tracking-tight text-brand-bone",
    meta: "mt-2 flex items-center justify-center gap-2 text-sm uppercase tracking-wide text-brand-bone/70",
    bio: "mt-4 max-w-md text-base leading-relaxed text-brand-bone/80",
    socials: "justify-center",
    link: "w-full rounded-none border-2 border-brand-bone bg-brand-bone px-5 py-4 text-center text-base font-bold uppercase tracking-wide text-brand-charcoal",
    headline: "text-2xl font-bold uppercase tracking-tight text-brand-bone",
    text: "text-base leading-relaxed text-brand-bone/80",
    centered: true,
  },

  // Left-aligned, magazine feel.
  editorial: {
    main: "mx-auto flex w-full max-w-lg flex-1 flex-col items-start px-6 pt-14 pb-10 text-left",
    avatar:
      "relative h-20 w-20 overflow-hidden rounded-full ring-1 ring-brand-bone/20",
    name: "mt-4 text-3xl font-semibold tracking-tight text-brand-bone",
    meta: "mt-1 flex items-center gap-2 text-sm text-brand-bone/65",
    bio: "mt-3 max-w-md text-sm leading-relaxed text-brand-bone/75",
    socials: "justify-start",
    link: "w-full rounded-md border border-brand-bone/30 bg-transparent px-5 py-3.5 text-left text-sm font-medium text-brand-bone",
    headline:
      "text-xl font-semibold tracking-tight text-brand-bone border-b border-brand-bone/20 pb-2 w-full",
    text: "text-sm leading-relaxed text-brand-bone/75",
    centered: false,
  },
};

export function templateStyles(t: PageTemplate): TemplateStyles {
  return PAGE_TEMPLATE_STYLES[t] ?? PAGE_TEMPLATE_STYLES.clean;
}
