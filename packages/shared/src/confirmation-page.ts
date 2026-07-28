// Custom confirmation page (Plus build P3d).
//
// What a client sees immediately after sending a booking request. Free gets
// the default Inklee wording; Plus can replace the headline and message and
// add ONE link of their own (an aftercare page, a studio address, a Linktree).
//
// Stored in `profiles.settings.confirmation_page`, the same settings-JSONB
// family as bio_page / books_settings / appearance: no migration, one shared
// parser serving the public render, the web editor and the native editor.
//
// Scope is deliberately narrow. "Custom confirmation page" could mean a page
// builder; it does not here. The confirmation screen is read for three seconds
// by someone who has just finished a form, and the two things artists actually
// want on it are their own words and one place to send the client next. A
// block editor would be a second page system to keep correct for that.
//
// The EDITED and CANCELLED variants keep the default wording on purpose: those
// are transactional outcomes ("your changes are saved", "your request is
// cancelled") where an artist's welcome message would read as wrong.

/** The custom fields an artist may set. Null means "use the default". */
export type ConfirmationPageSettings = {
  /** Replaces "Request sent". */
  headline: string | null;
  /** Replaces the default body copy. */
  message: string | null;
  /** One optional call to action shown under the message. */
  linkUrl: string | null;
  linkLabel: string | null;
};

export const DEFAULT_CONFIRMATION_PAGE: ConfirmationPageSettings = {
  headline: null,
  message: null,
  linkUrl: null,
  linkLabel: null,
};

export const CONFIRMATION_HEADLINE_MAX = 80;
export const CONFIRMATION_MESSAGE_MAX = 400;
export const CONFIRMATION_LINK_LABEL_MAX = 40;

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

/** Only absolute http(s) URLs reach the public page. A stored `javascript:`
 *  or `data:` value becomes null rather than an error: this renders on a page
 *  a stranger reaches from a form they just submitted. */
function url(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || !/^https?:\/\//i.test(s)) return null;
  return s.slice(0, 2048);
}

export function parseConfirmationPage(raw: unknown): ConfirmationPageSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONFIRMATION_PAGE };
  const o = raw as Record<string, unknown>;
  const linkUrl = url(o.linkUrl);
  return {
    headline: text(o.headline, CONFIRMATION_HEADLINE_MAX),
    message: text(o.message, CONFIRMATION_MESSAGE_MAX),
    linkUrl,
    // A label without a URL is not a link, and a URL without a label needs
    // one, so the pair is normalized together rather than rendered half-set.
    linkLabel: linkUrl
      ? (text(o.linkLabel, CONFIRMATION_LINK_LABEL_MAX) ?? "Learn more")
      : null,
  };
}

/** Whether the artist customized anything at all. Used to skip the whole
 *  custom path (and its entitlement read) for the overwhelming majority who
 *  have not. */
export function hasCustomConfirmation(s: ConfirmationPageSettings): boolean {
  return s.headline !== null || s.message !== null || s.linkUrl !== null;
}
