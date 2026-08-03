import { createClient } from "@/lib/supabase/server";
import {
  isConnectStatus,
  getConnectRequirementState,
  type ConnectStatus,
} from "@/lib/stripe-connect";
import { getDepositCollection } from "@/lib/server/deposit-collection";
import { resolveNoSeparateCardProcessingFeesClaim } from "@/lib/server/billing/activation";
import { NO_SEPARATE_CARD_PROCESSING_FEES_CLAIM } from "@inklee/shared/platform-fee";
import PayoutsControls from "./payouts-controls";
import ConnectKycForm from "./connect-kyc-form";
import VerificationDocumentForm from "./verification-document-form";

const STATUS_LABEL: Record<ConnectStatus, string> = {
  unset: "Not connected",
  pending: "Onboarding in progress",
  active: "Connected",
  restricted: "Action needed",
  disabled: "Disabled by Stripe",
};

// G1 (FEE-DSP-001): the fee sentence is now a FUNCTION of the artist's
// resolved appointment-lane tier (getDepositCollection -> appointmentFeeDisplay),
// not a flat PLATFORM_FEE_PERCENT constant baked in at module load. `feePercentLabel`
// is null when the tier cannot transact the lane at all (v2 Free, unreachable
// while v1 is active) — the sentence then says collection isn't part of the
// plan rather than printing a fabricated 0%.
//
// A7 (counsel-accountant-handoff-2026-08.md PART 4): the "no separate
// card-processing fees" claim used to be tied to the rate being exactly 300
// bps, which reads as true only by coincidence of today's flat rate. Counsel's
// answer binds it instead to WHO PAYS Stripe (`fees.payer: application`,
// @inklee/shared/platform-fee) — true at any rate Inklee absorbs the cost at,
// 3% or 0.5% alike — AND, where the rate is BELOW processing cost, to a founder
// recording of intent, since absorbing the cost at 0.5% is a subsidy rather
// than a margin (D6, corrected 2026-08-03: requiring that recording at EVERY
// rate withdrew a true, live claim from the 3% cohort). `showNoSeparateFeesClaim`
// is resolved ONCE by the caller and threaded through, so this function never
// re-derives it from the rate.
function statusDescription(
  status: ConnectStatus,
  feePercentLabel: string | null,
  showNoSeparateFeesClaim: boolean,
): string {
  const cardProcessingNote = showNoSeparateFeesClaim
    ? ` ${NO_SEPARATE_CARD_PROCESSING_FEES_CLAIM}`
    : "";
  const feeClause = feePercentLabel
    ? ` A ${feePercentLabel}% processing fee is deducted per deposit.${cardProcessingNote}`
    : " Card deposit collection isn't part of your current plan.";
  switch (status) {
    case "unset":
      return `Optional. Set this up only if you want clients to pay deposits by card here. You enter your details below, Inklee verifies you with Stripe, and deposits land in your own account.${feeClause} Inklee never holds your money.`;
    case "pending":
      return "Stripe is verifying your details. Use Refresh status to check, or update your details below if something was off.";
    case "active":
      return feePercentLabel
        ? `You're verified. Clients can now pay deposits by card, each deposit lands in your account.${feeClause}`
        : "You're verified with Stripe, but card deposit collection isn't part of your current plan.";
    case "restricted":
      return "Stripe needs a bit more before you can take payments. Update your details below.";
    case "disabled":
      return "Stripe disabled this account. Contact Stripe support for next steps.";
  }
}

export default async function PayoutsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, stripe_account_updated_at",
    )
    .eq("id", user!.id)
    .single();

  const rawStatus = profile?.stripe_account_status as string | null;
  const status: ConnectStatus = isConnectStatus(rawStatus)
    ? rawStatus
    : "unset";
  const accountId = profile?.stripe_account_id as string | null;
  const chargesEnabled = !!profile?.stripe_charges_enabled;
  const payoutsEnabled = !!profile?.stripe_payouts_enabled;
  const country = profile?.stripe_account_country as string | null;
  const updatedAt = profile?.stripe_account_updated_at as string | null;

  // G1 (FEE-DSP-001): the resolved appointment-lane fee display for THIS
  // artist. Independent of Connect `status` above (that is Stripe's onboarding
  // state; this is the plan-tier rate), so the two combine in `statusDescription`
  // rather than either being derived from the other.
  const depositCollection = await getDepositCollection(user!.id);
  const feePercentLabel = depositCollection.feeDisplay?.percentLabel ?? null;
  const feeBps = depositCollection.feeDisplay?.bps ?? null;

  // A7 + D6: resolved ONCE here, for THIS artist's rate, and threaded through
  // (the fee sentence is built in three places and none of them may re-derive
  // it). The resolver supplies the fee-payer constant and, only where the rate
  // sits below processing cost, the founder's recorded intent.
  const showNoSeparateFeesClaim =
    await resolveNoSeparateCardProcessingFeesClaim(feeBps);

  // P0-3: fetch what Stripe still needs so the form can show it on load (the
  // artist can only self-resolve if we tell them). Fetched for every live
  // account, not just pending/restricted ones: Stripe routinely asks an ACTIVE
  // account for a document with a future deadline, and that window is exactly
  // when the artist can still fix it without losing payouts. Gating this on
  // pending/restricted hid the request until the deadline passed and the
  // account had already been downgraded.
  const requirementState =
    accountId && status !== "unset"
      ? await getConnectRequirementState(accountId)
      : { currentlyDue: [], pendingVerification: [], errors: [] };
  const requirementsDue = requirementState.currentlyDue;

  // Document requirements are the one thing the KYC form cannot satisfy, and
  // Custom Connect gives the artist no Stripe-hosted route to satisfy them
  // either.
  const DOCUMENT_CODES = [
    "individual.verification.document",
    "individual.verification.additional_document",
  ];
  const needsIdentityDocument = requirementsDue.includes(DOCUMENT_CODES[0]);
  const needsAdditionalDocument = requirementsDue.includes(DOCUMENT_CODES[1]);
  const documentPending = requirementState.pendingVerification.some((c) =>
    DOCUMENT_CODES.includes(c),
  );
  // Stripe's own words for why a submitted document was refused. Without these
  // a rejected artist re-uploads the same unusable photo indefinitely.
  const documentErrors = requirementState.errors.filter((e) =>
    DOCUMENT_CODES.includes(e.requirement),
  );
  // Keep the uploader mounted for any live account so a successful upload's
  // confirmation is not torn off the screen the moment the requirement clears,
  // and so an artist can supply a document before Stripe blocks them.
  const canUploadDocuments =
    accountId !== null && status !== "unset" && status !== "disabled";
  const documentsRequired = needsIdentityDocument || needsAdditionalDocument;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Payouts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional. Set this up only if you want clients to pay deposits by card
          here.{" "}
          {feePercentLabel
            ? `Each deposit lands in your own account with a ${feePercentLabel}% processing fee deducted.${showNoSeparateFeesClaim ? ` ${NO_SEPARATE_CARD_PROCESSING_FEES_CLAIM}` : ""}`
            : "Card deposit collection isn't part of your current plan."}{" "}
          Without it, you can still collect deposits manually.
        </p>
      </div>

      <div className="space-y-3 rounded-[20px] border border-border p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Status
          </p>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-foreground">{STATUS_LABEL[status]}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {statusDescription(status, feePercentLabel, showNoSeparateFeesClaim)}
        </p>

        {(status === "active" ||
          status === "restricted" ||
          status === "disabled") &&
          accountId && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-3 text-xs">
              {country && (
                <>
                  <dt className="text-muted-foreground">Country</dt>
                  <dd className="text-foreground">{country.toUpperCase()}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Charges enabled</dt>
              <dd className="text-foreground">
                {chargesEnabled ? "Yes" : "No"}
              </dd>
              <dt className="text-muted-foreground">Payouts enabled</dt>
              <dd className="text-foreground">
                {payoutsEnabled ? "Yes" : "No"}
              </dd>
              {updatedAt && (
                <>
                  <dt className="text-muted-foreground">Last synced</dt>
                  <dd className="text-foreground">
                    {new Date(updatedAt).toLocaleString()}
                  </dd>
                </>
              )}
            </dl>
          )}
      </div>

      {status !== "active" && status !== "disabled" && (
        <div className="rounded-[20px] border border-border p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            {status === "unset" ? "Set up payouts" : "Your details"}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            You complete this here. Your details go straight to Stripe for
            verification and are not stored by Inklee.
          </p>
          <ConnectKycForm
            status={status}
            email={user?.email ?? ""}
            requirementsDue={requirementsDue}
          />
        </div>
      )}

      {canUploadDocuments && (
        <div
          className={`space-y-6 rounded-[20px] border p-5 ${
            documentsRequired
              ? "border-brand-mustard/50 bg-brand-mustard/5"
              : "border-border"
          }`}
        >
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {documentsRequired
                ? "Stripe needs a document from you"
                : "Verification documents"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {documentsRequired
                ? "Stripe verifies some accounts by hand. Send what it asks for below, and it usually reviews within a few minutes."
                : "Stripe is not asking for a document right now. If it does, or if it refuses one you sent, you can upload a new copy here."}
            </p>
          </div>

          {documentErrors.length > 0 && (
            <div className="space-y-1.5 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">
                Stripe could not use what you sent:
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {documentErrors.map((e) => (
                  <li key={`${e.requirement}-${e.reason}`}>{e.reason}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Send a new copy below.
              </p>
            </div>
          )}

          {documentPending && documentErrors.length === 0 && (
            <p className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
              Stripe is reviewing a document you sent. Use Refresh status to
              check.
            </p>
          )}

          <VerificationDocumentForm
            kind="identity"
            heading="Photo ID"
            hint="A passport, national ID card, or driving licence. The name and date of birth must match the details you entered above."
            required={needsIdentityDocument}
          />

          <div className="border-t border-border pt-6">
            <VerificationDocumentForm
              kind="additional"
              heading="Additional document"
              hint="Usually proof of address, for example a utility bill or bank statement from the last three months showing the address you entered above."
              required={needsAdditionalDocument}
            />
          </div>
        </div>
      )}

      <PayoutsControls hasAccount={accountId !== null} />

      <p className="text-xs text-muted-foreground">
        Setting up payouts is optional and reversible.{" "}
        {feePercentLabel
          ? `Deposits you collect this way land in your own account, with a ${feePercentLabel}% processing fee deducted.${showNoSeparateFeesClaim ? ` ${NO_SEPARATE_CARD_PROCESSING_FEES_CLAIM}` : ""}`
          : "Card deposit collection isn't part of your current plan."}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectStatus }) {
  const tone =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
      : status === "pending"
        ? "bg-amber-500/20 text-amber-900 dark:text-amber-100"
        : status === "restricted"
          ? "bg-orange-500/25 text-orange-950 dark:text-orange-50"
          : status === "disabled"
            ? "bg-destructive/15 text-destructive"
            : "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
