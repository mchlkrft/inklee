"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  ensureConnectAccount,
  updateConnectKyc,
  syncConnectAccount,
  uploadConnectVerificationDocument,
  VERIFICATION_DOCUMENT_MAX_BYTES,
  VERIFICATION_DOCUMENT_MIME_TYPES,
  type ConnectStatus,
  type VerificationDocumentFile,
  type VerificationDocumentKind,
} from "@/lib/stripe-connect";
import {
  isSupportedConnectCountry,
  DEFAULT_CONNECT_COUNTRY,
} from "@/lib/connect-countries";
import { getClientIp } from "@/lib/get-client-ip";
import { publicArtistUrl } from "@/lib/public-url";
import { checkConnectKycRateLimit } from "@/lib/ratelimit";

type KycState =
  | { ok: true; status: ConnectStatus; requirementsDue: string[] }
  | { error: string }
  | null;

function field(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? "").trim();
}

/**
 * Submit the artist's payout KYC for a Custom Connect account (Slice 79). The
 * artist fills this in inside Inklee — no Stripe-hosted redirect. Creates the
 * connected account on first submit (country is locked at creation), then
 * forwards the KYC to Stripe via `updateConnectKyc`. The PII never touches an
 * Inklee table; only the derived status is persisted. Idempotent: re-submitting
 * (e.g. to clear `restricted` requirements) reuses the same account.
 */
export async function submitConnectKycAction(
  _prev: KycState,
  formData: FormData,
): Promise<KycState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // P2-2: throttle KYC submits (each makes 2 Stripe round-trips).
  const { allowed } = await checkConnectKycRateLimit(user.id);
  if (!allowed) {
    return { error: "Too many attempts. Please try again in a little while." };
  }

  const email = user.email;
  if (!email) {
    return { error: "Your account needs an email before setting up payouts." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, stripe_account_country, slug")
    .eq("id", user.id)
    .single();

  // Country is fixed at account creation, so prefer a just-submitted choice,
  // then a country already on the profile (re-submit), then the default market.
  const submittedCountry = formData.get("country");
  const country = isSupportedConnectCountry(submittedCountry)
    ? submittedCountry
    : isSupportedConnectCountry(profile?.stripe_account_country)
      ? (profile!.stripe_account_country as string)
      : DEFAULT_CONNECT_COUNTRY;

  const ensured = await ensureConnectAccount({
    userId: user.id,
    email,
    existingAccountId: profile?.stripe_account_id ?? null,
    country,
  });
  if ("error" in ensured) return { error: ensured.error };

  const firstName = field(formData, "first_name");
  const lastName = field(formData, "last_name");
  // DOB comes from a native <input type="date"> as "YYYY-MM-DD".
  const dobParts = field(formData, "dob").split("-");
  const dobYear = parseInt(dobParts[0] ?? "", 10);
  const dobMonth = parseInt(dobParts[1] ?? "", 10);
  const dobDay = parseInt(dobParts[2] ?? "", 10);
  const phone = field(formData, "phone");
  const addressLine1 = field(formData, "address_line1");
  const addressCity = field(formData, "address_city");
  const addressPostalCode = field(formData, "address_postal_code");
  const iban = field(formData, "iban").replace(/\s+/g, "");
  const kycEmail = field(formData, "email") || email;

  // Cheap presence check before the Stripe round-trip — Stripe returns the
  // authoritative requirements list, but this catches blank submits early.
  if (
    !firstName ||
    !lastName ||
    !phone ||
    !addressLine1 ||
    !addressCity ||
    !addressPostalCode ||
    !iban ||
    !Number.isInteger(dobDay) ||
    !Number.isInteger(dobMonth) ||
    !Number.isInteger(dobYear)
  ) {
    return { error: "Please fill in every field." };
  }

  const ip = getClientIp(await headers());
  // Stripe's business_profile.url must be a valid public https URL. In local
  // dev publicArtistUrl resolves to http://localhost:3000/... which Stripe
  // rejects ("Not a valid URL"), so fall back to the public site there.
  const computedUrl = publicArtistUrl(profile?.slug ?? null);
  const businessUrl = computedUrl.startsWith("https://")
    ? computedUrl
    : "https://inkl.ee";

  const result = await updateConnectKyc({
    accountId: ensured.id,
    userId: user.id,
    country,
    firstName,
    lastName,
    dobDay,
    dobMonth,
    dobYear,
    email: kycEmail,
    phone,
    addressLine1,
    addressCity,
    addressPostalCode,
    iban,
    businessUrl,
    tosIp: ip,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/settings/payouts");
  return {
    ok: true,
    status: result.status,
    requirementsDue: result.requirementsDue,
  };
}

type DocumentState =
  | { ok: true; status: ConnectStatus; requirementsDue: string[] }
  | { error: string }
  | null;

/** Pull one uploaded image off the FormData, validating it before any bytes
 *  leave the server. Returns null when the field is absent (an optional back
 *  side), or an error string the artist can act on. */
async function readDocumentFile(
  formData: FormData,
  key: string,
  label: string,
): Promise<
  { file: VerificationDocumentFile } | { error: string } | { missing: true }
> {
  const entry = formData.get(key);
  if (!(entry instanceof File) || entry.size === 0) return { missing: true };

  if (
    !(VERIFICATION_DOCUMENT_MIME_TYPES as readonly string[]).includes(
      entry.type,
    )
  ) {
    return { error: `${label} must be a JPG, PNG, or WEBP image.` };
  }
  if (entry.size > VERIFICATION_DOCUMENT_MAX_BYTES) {
    return { error: `${label} must be smaller than 10 MB.` };
  }

  const bytes = new Uint8Array(await entry.arrayBuffer());
  return {
    file: {
      bytes,
      // Stripe only uses the name as a label. Strip any path the browser sent
      // and keep it short rather than trusting the client string.
      filename: (entry.name.split(/[\\/]/).pop() ?? "document").slice(0, 100),
      mimeType: entry.type,
    },
  };
}

/**
 * Send an identity document to Stripe for a Connect account that Stripe has
 * asked to verify. The artist can only clear a document requirement through
 * Inklee (Custom Connect, `requirement_collection: application`), so without
 * this they are stuck: the payouts page can name the requirement but nothing
 * could satisfy it.
 *
 * The image never touches Inklee storage. It is read into memory, forwarded to
 * Stripe, and dropped when the request ends.
 */
export async function uploadVerificationDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Same throttle as the KYC submit: each call is several Stripe round-trips
  // with a multi-megabyte body.
  const { allowed } = await checkConnectKycRateLimit(user.id);
  if (!allowed) {
    return { error: "Too many attempts. Please try again in a little while." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, stripe_account_status")
    .eq("id", user.id)
    .single();
  const accountId = profile?.stripe_account_id as string | null;
  // Mirrors syncConnectAccountAction's H-4 guard: never call Stripe for an
  // account we no longer control or never created.
  if (!accountId || profile?.stripe_account_status === "unset") {
    return { error: "Set up your payout details first, then add documents." };
  }

  const rawKind = formData.get("kind");
  const kind: VerificationDocumentKind =
    rawKind === "additional" ? "additional" : "identity";

  const front = await readDocumentFile(formData, "front", "The front image");
  if ("error" in front) return { error: front.error };
  if ("missing" in front) return { error: "Please choose a document image." };

  const back = await readDocumentFile(formData, "back", "The back image");
  if ("error" in back) return { error: back.error };

  const result = await uploadConnectVerificationDocument({
    userId: user.id,
    accountId,
    kind,
    front: front.file,
    back: "file" in back ? back.file : null,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/settings/payouts");
  return {
    ok: true,
    status: result.status,
    requirementsDue: result.requirementsDue,
  };
}

type SyncState = { ok: true; status: ConnectStatus } | { error: string } | null;

/**
 * Re-fetch the account from Stripe and persist the derived status. Used by the
 * settings page's "Refresh status" button while Stripe finishes verification.
 */
export async function syncConnectAccountAction(
  _prev: SyncState,
): Promise<SyncState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, stripe_account_status")
    .eq("id", user.id)
    .single();
  const accountId = profile?.stripe_account_id as string | null;
  const status = profile?.stripe_account_status as string | null;

  // H-4: don't call Stripe for an account we no longer control (deauthorized →
  // status "unset" but id retained) or one that was never created — Stripe
  // would 403/404 and the message could echo the account id back to the UI.
  if (!accountId || status === "unset") {
    return { error: "No payout account to refresh yet." };
  }

  const result = await syncConnectAccount({ userId: user.id, accountId });
  if ("error" in result) return { error: result.error };
  revalidatePath("/settings/payouts");
  return { ok: true, status: result.status };
}
