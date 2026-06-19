// Canonical validation for the editable artist profile text columns
// (display_name, bio, instagram_handle, location). The mobile validators were
// the stricter/correct side: 80/280/30/120 length caps and a strip-ALL-leading-@
// rule. The three web write paths (settings, onboarding-profile, claim-slug) had
// no length caps and stripped only a single leading @, so an >80-char name or
// "@@handle" could persist on web in a state mobile would then reject on re-edit.
// Single-sourced here so the whole profile lifecycle agrees. Pure + Intl-free.
// (ME-10 D18)

export const DISPLAY_NAME_MAX = 80;
export const BIO_MAX = 280;
export const INSTAGRAM_MAX = 30;
export const LOCATION_MAX = 120;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Trim + strip ALL leading @ from an Instagram handle; empty -> null. */
export function normalizeInstagramHandle(value: unknown): string | null {
  const v = asString(value).trim().replace(/^@+/, "");
  return v.length > 0 ? v : null;
}

export type ProfileFields = {
  displayName: string;
  bio: string | null;
  instagramHandle: string | null;
  location: string | null;
};

export type ProfileFieldsResult =
  | { ok: true; value: ProfileFields }
  | { ok: false; error: string };

export type ProfileFieldsInput = {
  displayName?: unknown;
  bio?: unknown;
  instagramHandle?: unknown;
  location?: unknown;
};

/**
 * Validate/normalize the four editable profile text columns to the canonical
 * bounds. Empty strings collapse to null (displayName stays a string). A field
 * the caller doesn't submit is simply absent → its normalized value is null/""
 * and the caller ignores it.
 *
 * `requireDisplayName: false` is for the onboarding-profile step (which edits
 * bio/instagram/location only, the name having been set at claim time).
 * `displayNameRequiredError` overrides the copy for the claim step
 * ("Artist name is required.").
 */
export function normalizeProfileFields(
  input: ProfileFieldsInput,
  opts: {
    requireDisplayName?: boolean;
    displayNameRequiredError?: string;
  } = {},
): ProfileFieldsResult {
  const requireDisplayName = opts.requireDisplayName ?? true;

  const displayName = asString(input.displayName).trim();
  if (requireDisplayName && !displayName) {
    return {
      ok: false,
      error: opts.displayNameRequiredError ?? "Display name is required.",
    };
  }
  if (displayName.length > DISPLAY_NAME_MAX) {
    return {
      ok: false,
      error: `Display name is too long (max ${DISPLAY_NAME_MAX} characters).`,
    };
  }

  const bioRaw = asString(input.bio).trim();
  if (bioRaw.length > BIO_MAX) {
    return { ok: false, error: `Bio must be ${BIO_MAX} characters or fewer.` };
  }
  const bio = bioRaw.length > 0 ? bioRaw : null;

  const instagramRaw = asString(input.instagramHandle).trim().replace(/^@+/, "");
  if (instagramRaw.length > INSTAGRAM_MAX) {
    return {
      ok: false,
      error: `Instagram handle is too long (max ${INSTAGRAM_MAX} characters).`,
    };
  }
  const instagramHandle = instagramRaw.length > 0 ? instagramRaw : null;

  const locationRaw = asString(input.location).trim();
  if (locationRaw.length > LOCATION_MAX) {
    return {
      ok: false,
      error: `Location is too long (max ${LOCATION_MAX} characters).`,
    };
  }
  const location = locationRaw.length > 0 ? locationRaw : null;

  return { ok: true, value: { displayName, bio, instagramHandle, location } };
}
