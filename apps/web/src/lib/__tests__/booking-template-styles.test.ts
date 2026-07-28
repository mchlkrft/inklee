import { describe, it, expect } from "vitest";
import { PAGE_TEMPLATES } from "@inklee/shared/appearance";
import {
  BOOKING_TEMPLATE_STYLES,
  bookingTemplateStyles,
  type BookingTemplateStyles,
} from "@inklee/shared/booking-template-styles";

const KEYS: (keyof BookingTemplateStyles)[] = [
  "header",
  "headerInner",
  "logo",
  "name",
  "meta",
  "bio",
  "chips",
  "panel",
  "panelInner",
  "heading",
  "subheading",
];

describe("booking template styles", () => {
  it("covers every template with every slot filled", () => {
    for (const t of PAGE_TEMPLATES) {
      const s = BOOKING_TEMPLATE_STYLES[t];
      expect(s, `missing template ${t}`).toBeDefined();
      for (const k of KEYS) {
        expect(s[k], `${t}.${k} is empty`).toBeTruthy();
      }
    }
  });

  it("falls back to clean for an unknown template", () => {
    expect(bookingTemplateStyles("nope" as never)).toBe(
      BOOKING_TEMPLATE_STYLES.clean,
    );
  });

  // The regression guard that matters: `clean` is what every Free artist and
  // every artist who never picked a layout renders. These literals are the
  // classes the public page carried inline before P3b, so a change to `clean`
  // has to be deliberate enough to update this test.
  it("keeps clean byte-identical to the pre-P3b page", () => {
    expect(BOOKING_TEMPLATE_STYLES.clean).toEqual({
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
    });
  });

  it("marks only editorial as uncentred", () => {
    expect(BOOKING_TEMPLATE_STYLES.editorial.centered).toBe(false);
    expect(BOOKING_TEMPLATE_STYLES.clean.centered).toBe(true);
    expect(BOOKING_TEMPLATE_STYLES.portfolio.centered).toBe(true);
    expect(BOOKING_TEMPLATE_STYLES.bold.centered).toBe(true);
  });

  it("keeps the panel on the workspace token in every template", () => {
    // The panel hosts the form, whose colours come from the appearance CSS
    // vars scoped by [data-appearance]. A template that hardcoded a background
    // would silently opt out of the artist's theme.
    for (const t of PAGE_TEMPLATES) {
      expect(BOOKING_TEMPLATE_STYLES[t].panel).toContain(
        "bg-[color:var(--color-workspace-bg)]",
      );
    }
  });
});
