// OT-12 Stripe Connect: helpers for the artist-side Connect account state.
//
// Two layers:
//
//   1. Pure decoder (`deriveConnectStatus`): maps a Stripe `Account` payload
//      to our `ConnectStatus` union. No Stripe SDK calls, fully testable.
//   2. Thin wrappers around `stripe.accounts.*` and `stripe.accountLinks.*`
//      that the settings page + webhook call. These are server-only.
//
// See `docs/ot-12-stripe-connect-plan.md` for the slice plan. NOTE: the model
// moved from Express to Custom in Slice 79 (in-app KYC, artist never visits
// Stripe; destination charges + `on_behalf_of`); references to "Express" below
// are historical.

import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { stripe } from "@/lib/stripe";
import { serviceClient } from "@/lib/supabase/service";
import { payoutCurrencyForCountry } from "@/lib/connect-countries";

// Server-only. This module performs Stripe Connect account + KYC operations
// with the secret key and must never be bundled into a client component.
// (Type-only imports like `import type { ConnectStatus }` are erased and do
// not trip this guard.)
if (typeof window !== "undefined") {
  throw new Error("stripe-connect must not be imported in client components");
}

export const CONNECT_STATUSES = [
  "unset",
  "pending",
  "active",
  "restricted",
  "disabled",
] as const;
export type ConnectStatus = (typeof CONNECT_STATUSES)[number];

export function isConnectStatus(value: unknown): value is ConnectStatus {
  return (
    typeof value === "string" &&
    (CONNECT_STATUSES as readonly string[]).includes(value)
  );
}

// Subset of Stripe.Account we care about. Keeping our input loose makes the
// decoder testable without importing the whole Stripe SDK in tests.
export type ConnectAccountSnapshot = {
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  details_submitted?: boolean | null;
  disabled_reason?: string | null;
  requirements?: {
    disabled_reason?: string | null;
    currently_due?: string[] | null;
    past_due?: string[] | null;
  } | null;
};

/**
 * Single decoder used both at webhook-time and at request-time
 * `accounts.retrieve()` re-sync. Maps a Stripe Account payload to one of:
 *
 *   - unset       (account argument was null/undefined — pre-onboarding row)
 *   - disabled    (Stripe disabled the account entirely)
 *   - pending     (details not submitted yet, onboarding in progress)
 *   - restricted  (Stripe has requirements past due, charges may still work
 *                  but the artist needs to act)
 *   - active      (charges_enabled + payouts_enabled + no past-due
 *                  requirements blocking it)
 *
 * Order of checks matters — disabled wins over restricted wins over pending
 * wins over active.
 */
export function deriveConnectStatus(
  account: ConnectAccountSnapshot | null | undefined,
): ConnectStatus {
  if (!account) return "unset";

  const reqDisabled = account.requirements?.disabled_reason ?? null;
  if (
    account.disabled_reason ||
    (typeof reqDisabled === "string" && reqDisabled.startsWith("rejected"))
  ) {
    return "disabled";
  }

  if (!account.details_submitted) return "pending";

  const pastDue = account.requirements?.past_due ?? [];
  if (Array.isArray(pastDue) && pastDue.length > 0) return "restricted";

  if (!account.charges_enabled || !account.payouts_enabled) {
    return "restricted";
  }

  return "active";
}

/**
 * Decide whether the artist's Connect account is in a state where Inklee
 * should route a real charge through it. Used by `requestDeposit` (OT-12.2)
 * to add `on_behalf_of` + `transfer_data.destination` to new PaymentIntents,
 * and by `getAddonProducts` to per-artist gate goods checkout availability.
 *
 * Returns `routeCharges = true` only when the artist has finished onboarding
 * AND Stripe says charges are enabled. `restricted` accounts return false —
 * Stripe may still let them charge in some windows, but we'd rather show the
 * artist a clear status than surprise them with random failures.
 */
export type ConnectRouting = {
  stripeAccountId: string | null;
  routeCharges: boolean;
};

export function deriveConnectRouting(profile: {
  stripe_account_id: string | null | undefined;
  stripe_account_status: string | null | undefined;
  stripe_charges_enabled: boolean | null | undefined;
}): ConnectRouting {
  const id = profile.stripe_account_id ?? null;
  const routeCharges =
    !!id &&
    profile.stripe_account_status === "active" &&
    profile.stripe_charges_enabled === true;
  return { stripeAccountId: id, routeCharges };
}

export async function getConnectRoutingForArtist(
  artistId: string,
): Promise<ConnectRouting> {
  const { data } = await serviceClient
    .from("profiles")
    .select("stripe_account_id, stripe_account_status, stripe_charges_enabled")
    .eq("id", artistId)
    .single();
  if (!data) return { stripeAccountId: null, routeCharges: false };
  return deriveConnectRouting(
    data as {
      stripe_account_id: string | null;
      stripe_account_status: string | null;
      stripe_charges_enabled: boolean | null;
    },
  );
}

// --- Server-only helpers below. Never import from a client component. ---

/**
 * Create a new Connect Custom account for an artist who hasn't onboarded
 * yet. Stores the new id on the artist's profile and returns it. Idempotent
 * caller-side: if the artist already has a `stripe_account_id` we don't
 * create another one — see `ensureConnectAccount`.
 */
async function createConnectAccount(args: {
  userId: string;
  email: string;
  country?: string;
}): Promise<{ id: string } | { error: string }> {
  if (!stripe) return { error: "Stripe is not configured on this deployment." };

  let account: Stripe.Account;
  try {
    account = await stripe.accounts.create(
      {
        // Custom controller (Slice 79, sandbox-validated): the artist never
        // sees Stripe. Inklee collects the KYC in-app (`requirement_collection:
        // application`), there is no Stripe dashboard for the artist, Inklee is
        // liable for losses, and Inklee pays Stripe's processing fee
        // (`fees.payer: application`) — the last point is WHY the deposit
        // application fee becomes the full 3% (see platform-fee.ts).
        controller: {
          requirement_collection: "application",
          stripe_dashboard: { type: "none" },
          losses: { payments: "application" },
          fees: { payer: "application" },
        },
        business_type: "individual",
        email: args.email,
        ...(args.country ? { country: args.country } : {}),
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { inklee_user_id: args.userId },
      },
      { idempotencyKey: `connect-create-${args.userId}` },
    );
  } catch (e) {
    return { error: stripeMessage(e, "Could not start payout setup.") };
  }

  const { error } = await serviceClient
    .from("profiles")
    .update({
      stripe_account_id: account.id,
      stripe_account_status: deriveConnectStatus(account),
      stripe_charges_enabled: account.charges_enabled ?? false,
      stripe_payouts_enabled: account.payouts_enabled ?? false,
      stripe_account_country: account.country ?? null,
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq("id", args.userId);
  if (error) return { error: error.message };

  return { id: account.id };
}

/**
 * Return the artist's `stripe_account_id`, creating one if missing. Caller
 * passes the email + country so we don't have to re-read the profile here.
 */
export async function ensureConnectAccount(args: {
  userId: string;
  email: string;
  country?: string;
  existingAccountId: string | null;
}): Promise<{ id: string } | { error: string }> {
  if (args.existingAccountId) return { id: args.existingAccountId };
  return createConnectAccount(args);
}

export type ConnectKycInput = {
  accountId: string;
  userId: string;
  country: string;
  firstName: string;
  lastName: string;
  dobDay: number;
  dobMonth: number;
  dobYear: number;
  email: string;
  phone: string;
  addressLine1: string;
  addressCity: string;
  addressPostalCode: string;
  iban: string;
  businessUrl: string;
  tosIp: string;
};

/**
 * Submit a Custom account's KYC to Stripe (Slice 79). The artist fills this in
 * inside Inklee; we forward it to `accounts.update` and attach the bank account
 * + ToS acceptance.
 *
 * PRIVACY (H-1/H-2): the PII here (name, DOB, address, phone, IBAN) goes
 * STRAIGHT to Stripe and is never written to an Inklee table or logged. Only
 * the derived account STATUS is persisted (via persistConnectAccount). On
 * error we surface Stripe's own message string, never the submitted values.
 */
export async function updateConnectKyc(
  input: ConnectKycInput,
): Promise<
  { requirementsDue: string[]; status: ConnectStatus } | { error: string }
> {
  if (!stripe) return { error: "Stripe is not configured on this deployment." };
  try {
    await stripe.accounts.update(input.accountId, {
      business_type: "individual",
      individual: {
        first_name: input.firstName,
        last_name: input.lastName,
        dob: { day: input.dobDay, month: input.dobMonth, year: input.dobYear },
        email: input.email,
        phone: input.phone,
        address: {
          line1: input.addressLine1,
          city: input.addressCity,
          postal_code: input.addressPostalCode,
          country: input.country,
        },
      },
      business_profile: {
        mcc: "7299", // miscellaneous personal services (closest fit for tattoo)
        url: input.businessUrl,
      },
      // Raw bank account is fine server-side. Stripe requires the currency
      // explicitly; derive it from the account country (eurozone → eur).
      external_account: {
        object: "bank_account",
        country: input.country,
        currency: payoutCurrencyForCountry(input.country),
        account_number: input.iban,
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: input.tosIp,
      },
    });
  } catch (e) {
    return { error: stripeMessage(e, "Could not save your payout details.") };
  }

  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(input.accountId);
  } catch (e) {
    return { error: stripeMessage(e, "Saved, but could not refresh status.") };
  }
  const persisted = await persistConnectAccount({
    userId: input.userId,
    account,
  });
  if ("error" in persisted) return { error: persisted.error };
  return {
    status: persisted.status,
    requirementsDue: account.requirements?.currently_due ?? [],
  };
}

/** Stripe accepts verification documents as JPG, PNG, or PDF only (per the
 *  Accounts API docs for individual.verification.document and
 *  additional_document), and caps uploads at 10 MB. Both are enforced before
 *  the bytes leave the server, because a format Stripe dislikes otherwise
 *  uploads cleanly and then fails review asynchronously, which the artist would
 *  experience as an unexplained rejection days later. PDF matters for the
 *  additional document: banks and utilities issue proof of address as PDF. */
export const VERIFICATION_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;
export const VERIFICATION_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Which requirement a document satisfies. `identity` is the ID photo Stripe
 *  asks for as `individual.verification.document`; `additional` is the second
 *  document (usually proof of address) it asks for as
 *  `individual.verification.additional_document`. */
export type VerificationDocumentKind = "identity" | "additional";

export type VerificationDocumentFile = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
};

/**
 * Upload an identity document to Stripe and attach it to the artist's Connect
 * account (Slice 79 follow-up).
 *
 * WHY THIS EXISTS: Inklee runs Custom Connect with
 * `requirement_collection: application`, so the artist never sees Stripe and
 * can only satisfy a requirement through Inklee. Everything except a document
 * was collectable in-app; when Stripe risk-flagged an account and asked for
 * `individual.verification.document`, the payouts page could name the
 * requirement but offered no way to supply it, leaving the artist hard-blocked
 * on payouts with no route forward.
 *
 * PRIVACY (matches updateConnectKyc's H-1/H-2 handling): the image bytes go
 * STRAIGHT to Stripe from memory. They are never written to a database, never
 * put in Supabase storage, never logged, and never echoed back. Only the Stripe
 * file id (an opaque handle) is passed onward, and only the derived account
 * status is persisted. Errors surface Stripe's own message, never the payload.
 */
export async function uploadConnectVerificationDocument(args: {
  userId: string;
  accountId: string;
  kind: VerificationDocumentKind;
  front: VerificationDocumentFile;
  back?: VerificationDocumentFile | null;
}): Promise<
  { status: ConnectStatus; requirementsDue: string[] } | { error: string }
> {
  if (!stripe) return { error: "Stripe is not configured on this deployment." };

  // Files are uploaded in the CONNECTED account's context so the document is
  // owned by the account it verifies, not by the platform.
  const uploadOne = async (
    file: VerificationDocumentFile,
  ): Promise<{ id: string } | { error: string }> => {
    try {
      const uploaded = await stripe!.files.create(
        {
          purpose: "identity_document",
          file: {
            data: Buffer.from(file.bytes),
            name: file.filename,
            type: file.mimeType,
          },
        },
        { stripeAccount: args.accountId },
      );
      return { id: uploaded.id };
    } catch (e) {
      return { error: stripeMessage(e, "Could not upload that document.") };
    }
  };

  const frontResult = await uploadOne(args.front);
  if ("error" in frontResult) return frontResult;

  let backId: string | null = null;
  if (args.back) {
    const backResult = await uploadOne(args.back);
    if ("error" in backResult) return backResult;
    backId = backResult.id;
  }

  const document: Stripe.AccountUpdateParams.Individual.Verification.Document =
    {
      front: frontResult.id,
      ...(backId ? { back: backId } : {}),
    };

  let account: Stripe.Account;
  try {
    account = await stripe.accounts.update(args.accountId, {
      individual: {
        verification:
          args.kind === "identity"
            ? { document }
            : { additional_document: document },
      },
    });
  } catch (e) {
    return { error: stripeMessage(e, "Could not attach that document.") };
  }

  const persisted = await persistConnectAccount({
    userId: args.userId,
    account,
  });
  if ("error" in persisted) return { error: persisted.error };
  return {
    status: persisted.status,
    requirementsDue: account.requirements?.currently_due ?? [],
  };
}

/**
 * Read-only fetch of the account's outstanding `currently_due` requirements
 * (Slice 80 P0-3). Used by the payouts page to show a not-yet-active artist
 * exactly what Stripe still needs, on load. Never persists, never throws — an
 * empty array on any error so the page still renders.
 */
export async function getConnectRequirements(
  accountId: string,
): Promise<string[]> {
  if (!stripe) return [];
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return account.requirements?.currently_due ?? [];
  } catch {
    return [];
  }
}

/** What Stripe currently wants from an account, including WHY it rejected
 *  anything already submitted.
 *
 *  `currently_due` alone is not enough for documents: when Stripe reviews an
 *  uploaded ID and refuses it, the requirement simply reappears with no visible
 *  reason, so the artist re-uploads the same unusable photo forever. The
 *  `requirements.errors` entries carry Stripe's own human-readable reason
 *  ("The image supplied is not readable", "The document is expired"), which is
 *  the only thing that lets them fix it. Never persists, never throws. */
export type ConnectRequirementState = {
  currentlyDue: string[];
  pendingVerification: string[];
  errors: { requirement: string; reason: string }[];
};

export async function getConnectRequirementState(
  accountId: string,
): Promise<ConnectRequirementState> {
  const empty: ConnectRequirementState = {
    currentlyDue: [],
    pendingVerification: [],
    errors: [],
  };
  if (!stripe) return empty;
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return {
      currentlyDue: account.requirements?.currently_due ?? [],
      pendingVerification: account.requirements?.pending_verification ?? [],
      errors: (account.requirements?.errors ?? []).map((e) => ({
        requirement: e.requirement,
        reason: e.reason,
      })),
    };
  } catch {
    return empty;
  }
}

/**
 * Re-fetch the account from Stripe and persist the derived state to the
 * artist's profile. Used by the webhook (`account.updated`) and by the
 * settings page's "Refresh status" path.
 */
export async function syncConnectAccount(args: {
  userId: string;
  accountId: string;
}): Promise<
  | {
      status: ConnectStatus;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      country: string | null;
    }
  | { error: string }
> {
  if (!stripe) return { error: "Stripe is not configured on this deployment." };
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(args.accountId);
  } catch (e) {
    return { error: stripeMessage(e, "Could not refresh account status.") };
  }
  return persistConnectAccount({ userId: args.userId, account });
}

/**
 * True when Stripe says this account id is not usable by the secret key we
 * hold: the id belongs to the other mode (a test `acct_` under a live key),
 * the account was deleted, or our platform access was revoked.
 *
 * Deliberately narrow. A rate limit, a 5xx, or a dropped connection must NEVER
 * read as "the account is gone" — that would downgrade every artist's payout
 * state during a Stripe incident. `resource_missing` in particular is generic,
 * so it only counts when the error points at an account-shaped parameter and
 * not at some other id in the same request.
 */
export function isConnectAccountUnreachable(
  err: unknown,
  accountId?: string | null,
): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    type?: string;
    code?: string;
    param?: string;
    statusCode?: number;
    message?: string;
  };
  const text = `${e.param ?? ""} ${e.message ?? ""}`;

  // Stripe maps EVERY 403 to StripePermissionError, which covers two very
  // different faults: "this acct_ is not usable by our key" (about one artist)
  // and "our key lacks the scope for this endpoint" (about the platform — a
  // restricted or rotated key). Only the first may downgrade an artist, so
  // require the error to actually name an account. A platform-scope 403 must
  // fail the deposit loudly without touching anyone's payout state.
  if (e.statusCode === 403 || e.type === "StripePermissionError") {
    return accountId
      ? text.includes(accountId)
      : /\bacct_[A-Za-z0-9]+/.test(text);
  }
  if (e.code === "account_invalid") return true;
  if (e.code === "resource_missing") {
    return /destination|on_behalf_of|account/i.test(text);
  }
  return false;
}

/**
 * Stripe reported the artist's Connect account as unreachable, so the profile's
 * cached "active / charges enabled" state is a lie: it keeps routing deposits
 * into PaymentIntents that can never be created. Downgrade to `restricted`
 * ("Action needed" on the payouts page) and clear the capability flags so
 * `deriveConnectRouting` stops returning `routeCharges`.
 *
 * The account id is deliberately KEPT. This runs automatically off a Stripe
 * error, and one platform-wide misconfiguration (a test key deployed to
 * production) would make every account look unreachable at once. A status
 * downgrade is fully reversible by the next successful sync or `account.updated`
 * webhook; wiping every artist's account id would not be. Clearing a genuinely
 * dead id stays a deliberate admin action — note that `ensureConnectAccount`
 * reuses a stored id, so an artist whose account is truly gone cannot
 * re-onboard until an admin clears the field.
 */
export async function markConnectAccountUnreachable(
  userId: string,
): Promise<void> {
  const { error } = await serviceClient
    .from("profiles")
    .update({
      stripe_account_status: "restricted" satisfies ConnectStatus,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) {
    // Non-fatal: the caller is already returning an error for the deposit. But
    // a failed downgrade means the profile keeps claiming it can route charges,
    // so this must not vanish.
    Sentry.captureException(error, {
      tags: { action: "mark_connect_account_unreachable" },
      extra: { userId },
    });
  }
}

/**
 * Webhook-side helper. The webhook gets the full Account object directly in
 * `event.data.object`, so we can skip the retrieve round-trip and just
 * persist. Looks up the artist by `stripe_account_id`.
 */
export async function persistConnectAccountFromEvent(
  account: Stripe.Account,
): Promise<{ userId: string | null } | { error: string }> {
  const { data: artist } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("stripe_account_id", account.id)
    .single();
  if (!artist) {
    // Webhook for an account we don't recognise — Inklee's webhook endpoint
    // may receive events for accounts created by other apps that share the
    // same Stripe Connect platform. Safe to no-op.
    return { userId: null };
  }
  const result = await persistConnectAccount({ userId: artist.id, account });
  if ("error" in result) return result;
  return { userId: artist.id };
}

async function persistConnectAccount(args: {
  userId: string;
  account: Stripe.Account;
}): Promise<
  | {
      status: ConnectStatus;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      country: string | null;
    }
  | { error: string }
> {
  const status = deriveConnectStatus(args.account);
  const update = {
    stripe_account_status: status,
    stripe_charges_enabled: args.account.charges_enabled ?? false,
    stripe_payouts_enabled: args.account.payouts_enabled ?? false,
    stripe_account_country: args.account.country ?? null,
    stripe_account_updated_at: new Date().toISOString(),
  };
  const { error } = await serviceClient
    .from("profiles")
    .update(update)
    .eq("id", args.userId);
  if (error) return { error: error.message };
  return {
    status,
    chargesEnabled: update.stripe_charges_enabled,
    payoutsEnabled: update.stripe_payouts_enabled,
    country: update.stripe_account_country,
  };
}

/**
 * `account.application.deauthorized`: artist disconnected Inklee from inside
 * their Stripe dashboard. Clear local fields so charges can't be attempted
 * against an account we no longer have permission for. We do NOT delete the
 * `stripe_account_id` row because booking history / past orders may still
 * reference it; OT-12.2 will null charge metadata at the order layer.
 */
export async function clearConnectAccountByExternalId(
  accountId: string,
): Promise<{ userId: string | null } | { error: string }> {
  const { data: artist } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("stripe_account_id", accountId)
    .single();
  if (!artist) return { userId: null };

  const { error } = await serviceClient
    .from("profiles")
    .update({
      stripe_account_status: "unset",
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_account_updated_at: new Date().toISOString(),
      // We keep `stripe_account_id` set so historical booking + order rows
      // remain traceable. Re-connecting later overwrites it via the standard
      // ensureConnectAccount path.
    })
    .eq("id", artist.id);
  if (error) return { error: error.message };
  return { userId: artist.id };
}

function stripeMessage(e: unknown, fallback: string): string {
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  return fallback;
}
