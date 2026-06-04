"use client";

import { useActionState } from "react";
import { submitConnectKycAction } from "./actions";
import type { ConnectStatus } from "@/lib/stripe-connect";
import {
  CONNECT_COUNTRIES,
  DEFAULT_CONNECT_COUNTRY,
} from "@/lib/connect-countries";

type State =
  | { ok: true; status: ConnectStatus; requirementsDue: string[] }
  | { error: string }
  | null;

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const LABEL = "text-sm text-muted-foreground";

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`kyc-${name}`} className={LABEL}>
        {label}
      </label>
      <input
        id={`kyc-${name}`}
        name={name}
        type={type}
        required
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className={INPUT}
      />
    </div>
  );
}

/**
 * In-app payout KYC form (Slice 79, Custom Connect). The artist completes this
 * inside Inklee and never visits Stripe. Fields map to what Stripe requires for
 * an individual account; the data is forwarded straight to Stripe by the server
 * action and is never stored by Inklee. Shown when the account is not yet
 * active (unset / pending / restricted).
 */
export default function ConnectKycForm({
  status,
  email,
}: {
  status: ConnectStatus;
  email: string;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    submitConnectKycAction,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      {status === "unset" && (
        <div className="space-y-1.5">
          <label htmlFor="kyc-country" className={LABEL}>
            Your country
          </label>
          <select
            id="kyc-country"
            name="country"
            defaultValue={DEFAULT_CONNECT_COUNTRY}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CONNECT_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Where you are based. This can&apos;t be changed once set.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" name="first_name" autoComplete="given-name" />
        <Field label="Last name" name="last_name" autoComplete="family-name" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="kyc-dob" className={LABEL}>
          Date of birth
        </label>
        <input id="kyc-dob" name="dob" type="date" required className={INPUT} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={email}
          autoComplete="email"
        />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          placeholder="+49…"
          autoComplete="tel"
        />
      </div>

      <Field
        label="Address"
        name="address_line1"
        placeholder="Street and number"
        autoComplete="address-line1"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="City" name="address_city" autoComplete="address-level2" />
        <Field
          label="Postal code"
          name="address_postal_code"
          autoComplete="postal-code"
        />
      </div>

      <Field
        label="IBAN"
        name="iban"
        placeholder="DE89 3704 0044 0532 0130 00"
      />

      <p className="text-xs text-muted-foreground">
        By submitting, you agree to the Stripe Connected Account Agreement.
        Inklee passes these details to Stripe to verify you and pay out
        deposits; we do not store them.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending
          ? "Saving…"
          : status === "unset"
            ? "Set up payouts"
            : "Update details"}
      </button>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="text-sm text-muted-foreground">
          {state.status === "active"
            ? "You're verified. Deposits can now be paid by card."
            : state.requirementsDue.length > 0
              ? "Saved. Stripe is verifying and may need a little more (sometimes an ID document). Check back shortly with Refresh status."
              : "Saved. Stripe is verifying your details. Check back shortly with Refresh status."}
        </p>
      )}
    </form>
  );
}
