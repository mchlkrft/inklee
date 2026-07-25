import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  taxClassFor,
  type ContractCustomerType,
  type VatCustomerStatus,
  type TaxTreatment,
} from "@/lib/billing";

// Withdrawal credit-note tax snapshot (P7, docs/legal/vat-and-oss-architecture.md
// section 4.2). On a consumer withdrawal refund we APPEND a
// transaction_tax_snapshots row with kind='credit_note' and NEGATIVE amounts,
// preserving the original rate + jurisdiction and referencing the original charge
// snapshot (corrects_snapshot_id) when one exists. It is an append-only tax
// RECORD, not part of the money move: it is BEST-EFFORT and must never block or
// roll back the statutory withdrawal (mirrors recordDurableConfirmation). The
// table is immutable (service-role RLS + a raise-on-mutation trigger + a
// content_hash) and the (kind, invoice, charge) unique index makes a redelivery
// or a resume a no-op.
//
// The invoice.paid CHARGE-snapshot writer is a separate (b2b tax) workstream. Two
// paths therefore exist: COPY the charge snapshot when present (fully correct,
// links via corrects_snapshot_id), else DERIVE the treatment from the same inputs
// the charge would have used (the customer's tax class against the approved
// policy's rules), so the credit note stays consistent once that writer lands.

type TreatmentRule = { treatment?: string; reverseCharge?: boolean };

type ChargeSnapshotRow = {
  id: string;
  tax_treatment: string;
  tax_jurisdiction: string | null;
  tax_rate: number | null;
  tax_code: string | null;
  reverse_charge_applied: boolean | null;
  oss_included: boolean | null;
  price_tax_behavior: string;
  tax_policy_version: string;
  classification_version: string | null;
  seller_country: string;
  seller_vat_registered: boolean;
  customer_country: string | null;
  contract_customer_type: string | null;
  vat_customer_status: string | null;
  vies_state: string | null;
};

type SnapshotTaxFields = {
  corrects_snapshot_id: string | null;
  tax_policy_version: string;
  classification_version: string | null;
  seller_country: string;
  seller_vat_registered: boolean;
  customer_country: string | null;
  contract_customer_type: string | null;
  vat_customer_status: string | null;
  vies_state: string | null;
  tax_treatment: string;
  tax_jurisdiction: string | null;
  tax_rate: number | null;
  tax_code: string | null;
  reverse_charge_applied: boolean;
  oss_included: boolean;
  price_tax_behavior: string;
};

export type CreditNoteInput = {
  artistId: string;
  billingSubscriptionId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  stripeInvoiceId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string;
  /** Refund split from the proration (positive minor units; stored NEGATED). */
  refundNetMinor: number;
  refundVatMinor: number;
  refundGrossMinor: number;
  /** The rate preserved from the original charge (0 while VAT-unregistered). */
  taxRate: number;
  currency: string;
  /** The contract type snapshotted on the subscription at purchase. */
  contractCustomerType: string;
};

/** Append a credit-note tax snapshot for a withdrawal refund. Returns the new (or
 *  existing, on a resume/redelivery) snapshot id, or null when nothing is credited
 *  or the write could not be completed. NEVER throws: a tax-record failure must
 *  not roll back the statutory withdrawal; it is captured for backfill instead. */
export async function writeWithdrawalCreditNote(
  input: CreditNoteInput,
): Promise<string | null> {
  if (input.refundGrossMinor <= 0) return null; // nothing was credited

  try {
    // Idempotency: at most one credit_note per charge. A resume or a Stripe
    // redelivery returns the existing id rather than a second row (the DB unique
    // index on (kind, invoice, charge) is the durable guard; this keeps resumes
    // from even attempting a duplicate insert).
    const { data: existing } = await serviceClient
      .from("transaction_tax_snapshots")
      .select("id")
      .eq("kind", "credit_note")
      .eq("stripe_charge_id", input.stripeChargeId)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    // The accountant-approved current tax posture supplies the NOT NULL seller
    // fields + the treatment-rule data. Without it we cannot write a lawful
    // snapshot: record the anomaly and skip (the withdrawal itself is unaffected).
    const { data: policy } = await serviceClient
      .from("tax_policies")
      .select(
        "version_label, seller_country, seller_vat_registered, treatment_rules",
      )
      .eq("is_current", true)
      .maybeSingle();
    if (!policy?.version_label) {
      Sentry.captureException(
        new Error("withdrawal credit note: no current tax policy"),
        {
          tags: { action: "billing_credit_note" },
          extra: {
            artistId: input.artistId,
            subscriptionId: input.stripeSubscriptionId,
          },
        },
      );
      return null;
    }

    // Prefer to COPY the original charge snapshot: it preserves the treatment,
    // rate, and jurisdiction exactly (P7) and links the correction chain.
    const { data: charge } = await serviceClient
      .from("transaction_tax_snapshots")
      .select(
        "id, tax_treatment, tax_jurisdiction, tax_rate, tax_code, reverse_charge_applied, oss_included, price_tax_behavior, tax_policy_version, classification_version, seller_country, seller_vat_registered, customer_country, contract_customer_type, vat_customer_status, vies_state",
      )
      .eq("kind", "charge")
      .eq("billing_subscription_id", input.billingSubscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let fields: SnapshotTaxFields;
    if (charge) {
      const c = charge as ChargeSnapshotRow;
      fields = {
        corrects_snapshot_id: c.id,
        tax_policy_version: c.tax_policy_version,
        classification_version: c.classification_version,
        seller_country: c.seller_country,
        seller_vat_registered: c.seller_vat_registered,
        customer_country: c.customer_country,
        contract_customer_type: c.contract_customer_type,
        vat_customer_status: c.vat_customer_status,
        vies_state: c.vies_state,
        tax_treatment: c.tax_treatment,
        tax_jurisdiction: c.tax_jurisdiction,
        tax_rate: c.tax_rate,
        tax_code: c.tax_code,
        reverse_charge_applied: c.reverse_charge_applied ?? false,
        oss_included: c.oss_included ?? false,
        price_tax_behavior: c.price_tax_behavior,
      };
    } else {
      // No charge snapshot yet: derive the treatment from the customer's class
      // against the approved policy's rules (the value the charge would carry).
      const { data: profile } = await serviceClient
        .from("account_billing_profiles")
        .select("contract_customer_type, vat_customer_status, billing_country")
        .eq("artist_id", input.artistId)
        .maybeSingle();
      const contractType =
        (profile?.contract_customer_type as string | null) ||
        input.contractCustomerType ||
        "consumer";
      const vatStatus =
        (profile?.vat_customer_status as string | null) || "unresolved";
      const country = (profile?.billing_country as string | null) ?? null;
      const taxClass = taxClassFor({
        contractCustomerType: contractType as ContractCustomerType,
        vatCustomerStatus: vatStatus as VatCustomerStatus,
        countryCode: country,
      });
      const rules =
        (policy.treatment_rules as Record<string, TreatmentRule> | null) ?? {};
      const rule = rules[taxClass];
      const treatment: TaxTreatment =
        (rule?.treatment as TaxTreatment | undefined) ?? "manual_review";
      // Reverse charge is only ever asserted for an EU VAT-registered business.
      const reverseChargeApplied =
        rule?.reverseCharge === true && taxClass === "eu_business_vat";
      fields = {
        corrects_snapshot_id: null,
        tax_policy_version: policy.version_label as string,
        classification_version: null,
        seller_country: policy.seller_country as string,
        seller_vat_registered: policy.seller_vat_registered as boolean,
        customer_country: country,
        contract_customer_type: contractType,
        vat_customer_status: vatStatus,
        vies_state: null,
        tax_treatment: treatment,
        tax_jurisdiction: null,
        tax_rate: input.taxRate,
        tax_code: null,
        reverse_charge_applied: reverseChargeApplied,
        oss_included: false,
        // Consumer prices are shown VAT-inclusive (the display convention); the
        // charge snapshot carries the authoritative value once its writer lands.
        price_tax_behavior: "inclusive",
      };
    }

    // NEGATIVE amounts: a credit note reverses the charge, so the accountant
    // export nets charges against refunds to what was actually collected.
    const netMinor = -Math.abs(Math.round(input.refundNetMinor));
    const vatMinor = -Math.abs(Math.round(input.refundVatMinor));
    const grossMinor = -Math.abs(Math.round(input.refundGrossMinor));

    const row = {
      kind: "credit_note" as const,
      corrects_snapshot_id: fields.corrects_snapshot_id,
      artist_id: input.artistId,
      billing_subscription_id: input.billingSubscriptionId,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
      stripe_invoice_id: input.stripeInvoiceId,
      stripe_payment_intent_id: input.stripePaymentIntentId,
      stripe_charge_id: input.stripeChargeId,
      stripe_tax_calculation_ref: null,
      pricing_plan_id: null,
      tax_policy_version: fields.tax_policy_version,
      classification_version: fields.classification_version,
      seller_country: fields.seller_country,
      seller_vat_registered: fields.seller_vat_registered,
      customer_country: fields.customer_country,
      contract_customer_type: fields.contract_customer_type,
      vat_customer_status: fields.vat_customer_status,
      vies_state: fields.vies_state,
      tax_treatment: fields.tax_treatment,
      tax_jurisdiction: fields.tax_jurisdiction,
      tax_rate: fields.tax_rate,
      tax_code: fields.tax_code,
      reverse_charge_applied: fields.reverse_charge_applied,
      oss_included: fields.oss_included,
      currency: input.currency,
      net_minor: netMinor,
      vat_minor: vatMinor,
      gross_minor: grossMinor,
      price_tax_behavior: fields.price_tax_behavior,
    };

    // content_hash over the tax-relevant fields (the accountant export re-verifies
    // it). Stable key order so the same settlement always hashes identically.
    const contentHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          kind: row.kind,
          corrects_snapshot_id: row.corrects_snapshot_id,
          stripe_invoice_id: row.stripe_invoice_id,
          stripe_charge_id: row.stripe_charge_id,
          stripe_payment_intent_id: row.stripe_payment_intent_id,
          tax_treatment: row.tax_treatment,
          tax_jurisdiction: row.tax_jurisdiction,
          tax_rate: row.tax_rate,
          reverse_charge_applied: row.reverse_charge_applied,
          oss_included: row.oss_included,
          currency: row.currency,
          net_minor: row.net_minor,
          vat_minor: row.vat_minor,
          gross_minor: row.gross_minor,
          price_tax_behavior: row.price_tax_behavior,
          tax_policy_version: row.tax_policy_version,
          seller_country: row.seller_country,
          seller_vat_registered: row.seller_vat_registered,
        }),
      )
      .digest("hex");

    const { data: inserted, error: insErr } = await serviceClient
      .from("transaction_tax_snapshots")
      .insert({ ...row, content_hash: contentHash })
      .select("id")
      .maybeSingle();
    if (insErr) {
      // 23505 = a concurrent write already created the credit note; re-read it so
      // the caller still links a snapshot to the case.
      if ((insErr as { code?: string }).code === "23505") {
        const { data: won } = await serviceClient
          .from("transaction_tax_snapshots")
          .select("id")
          .eq("kind", "credit_note")
          .eq("stripe_charge_id", input.stripeChargeId)
          .maybeSingle();
        return (won?.id as string | undefined) ?? null;
      }
      throw new Error(insErr.message);
    }
    return (inserted?.id as string | undefined) ?? null;
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "billing_credit_note" },
      extra: {
        artistId: input.artistId,
        subscriptionId: input.stripeSubscriptionId,
      },
    });
    return null;
  }
}
