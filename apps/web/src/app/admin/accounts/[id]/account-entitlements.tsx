"use client";

import { useState, useTransition } from "react";
import SelectInput from "@/components/select-input";
import {
  ENTITLEMENT_FEATURES,
  canAccess,
  effectivePlanTier,
  sponsorshipRemainingCents,
  type AccountOverrides,
  type EntitlementFeature,
} from "@/lib/entitlements";
import {
  setPlanOverrideAction,
  setEntitlementOverrideAction,
  setFeeSponsorshipAction,
  saveAdminNotesAction,
} from "./actions";

// Slice 81 — admin entitlements, fee-sponsorship + notes panel. Internal only.
// Every save calls a server action that writes the service-role `account_overrides`
// table and audit-logs the change.

const FEATURE_LABELS: Record<EntitlementFeature, string> = {
  deposits: "Card deposit collection",
  branding: "Branding control",
  custom_templates: "Custom email templates",
  extra_fields: "Extra custom fields",
  extra_trips: "Extra trips / studios",
  analytics: "Personal analytics",
};

// Mirrors the artist-facing labels on /settings/payouts so admin and artist
// describe the same state with the same words.
const CONNECT_STATUS_LABELS: Record<string, string> = {
  unset: "Not connected",
  pending: "Onboarding in progress",
  active: "Connected",
  restricted: "Action needed",
  disabled: "Disabled by Stripe",
};

function eur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

// ISO timestamp <-> <input type="date"> (YYYY-MM-DD). Expiry is end-of-day UTC.
function isoToDateInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}
function dateInputToIso(d: string): string | null {
  return d ? `${d}T23:59:59.000Z` : null;
}

const FIELD =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const SELECT_TRIGGER =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export default function AccountEntitlements({
  accountId,
  overrides,
  usage,
  connect,
}: {
  accountId: string;
  overrides: AccountOverrides;
  usage: { paidDepositCount: number; depositVolumeCents: number };
  /** The artist's Stripe Connect state, derived server-side (the helper lives
   *  in a server-only module). A card deposit needs BOTH the deposits
   *  entitlement and a charge-ready Connect account, so granting Plus without
   *  showing this half made a working grant look broken. */
  connect: { status: string; routeCharges: boolean };
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Plan
  const [planTier, setPlanTier] = useState(overrides.planTier);
  const [planSource, setPlanSource] = useState(overrides.planSource ?? "comp");
  const [planExpiry, setPlanExpiry] = useState(
    isoToDateInput(overrides.planExpiresAt),
  );

  // Fee sponsorship
  const [feeSponsored, setFeeSponsored] = useState(overrides.feeSponsored);
  const [feeExpiry, setFeeExpiry] = useState(
    isoToDateInput(overrides.feeSponsorExpiresAt),
  );
  const [capEur, setCapEur] = useState(
    overrides.feeSponsorCapCents !== null
      ? String(overrides.feeSponsorCapCents / 100)
      : "",
  );

  // Notes
  const [notes, setNotes] = useState(overrides.adminNotes ?? "");

  const run = (fn: () => Promise<{ error?: string }>, ok: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res?.error ? `Error: ${res.error}` : ok);
    });
  };

  const effective = effectivePlanTier(overrides);
  const remaining = sponsorshipRemainingCents(overrides);

  return (
    <section className="rounded-md border border-border p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Plan, entitlements &amp; fees
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            effective === "plus"
              ? "bg-brand-mustard/20 text-brand-charcoal"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {effective === "plus"
            ? `Plus${overrides.planSource ? ` · ${overrides.planSource}` : ""}`
            : "Free"}
        </span>
      </div>

      {msg && (
        <p
          className={`text-xs ${msg.startsWith("Error") ? "text-destructive" : "text-brand-green"}`}
        >
          {msg}
        </p>
      )}

      {/* Both halves must be true for a card deposit. Without this, a correct
          grant looks broken: the artist requests a deposit, the client gets no
          payment button, and nothing on this screen explains why. */}
      <div className="space-y-1 rounded-md border border-border bg-muted/20 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          Stripe payouts:{" "}
          <span className="font-medium text-foreground">
            {CONNECT_STATUS_LABELS[connect.status] ?? connect.status}
          </span>
        </p>
        {canAccess(overrides, "deposits") && !connect.routeCharges && (
          <p className="text-[11px] leading-snug text-brand-mustard">
            Card deposits are granted, but this artist cannot collect by card
            yet. Their deposit requests go out as manual deposits until payout
            setup is active.
          </p>
        )}
      </div>

      {/* Plan */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Plan</p>
        <div className="grid grid-cols-2 gap-2">
          <SelectInput
            options={[
              { value: "free", label: "Free" },
              { value: "plus", label: "Plus" },
            ]}
            value={planTier}
            onChange={(e) => setPlanTier(e.target.value as "free" | "plus")}
            ariaLabel="Plan tier"
            className={SELECT_TRIGGER}
          />
          <SelectInput
            options={[
              { value: "comp", label: "Comp" },
              { value: "paid", label: "Paid" },
            ]}
            value={planSource}
            onChange={(e) => setPlanSource(e.target.value as "comp" | "paid")}
            disabled={planTier === "free"}
            ariaLabel="Plan source"
            className={SELECT_TRIGGER}
          />
        </div>
        <label className="block text-[11px] text-muted-foreground">
          Expires (optional, leave blank for open-ended)
          <input
            type="date"
            value={planExpiry}
            onChange={(e) => setPlanExpiry(e.target.value)}
            disabled={planTier === "free"}
            className={`${FIELD} mt-1`}
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                setPlanOverrideAction(
                  accountId,
                  planTier,
                  planTier === "free" ? null : planSource,
                  planTier === "free" ? null : dateInputToIso(planExpiry),
                ),
              "Plan saved.",
            )
          }
          className="rounded-full bg-brand-mustard px-4 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Save plan
        </button>
      </div>

      {/* Entitlement overrides */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-medium text-foreground">Feature overrides</p>
        <p className="text-[11px] text-muted-foreground">
          Override individual features on top of the plan. &quot;Plan
          default&quot; follows the tier above.
        </p>
        {ENTITLEMENT_FEATURES.map((f) => {
          const ov = overrides.entitlementOverrides[f];
          const current = ov === true ? "grant" : ov === false ? "revoke" : "";
          return (
            <div key={f} className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground">
                {FEATURE_LABELS[f]}
              </span>
              <SelectInput
                options={[
                  { value: "", label: "Plan default" },
                  { value: "grant", label: "Granted" },
                  { value: "revoke", label: "Revoked" },
                ]}
                defaultValue={current}
                disabled={pending}
                onChange={(e) =>
                  run(
                    () =>
                      setEntitlementOverrideAction(
                        accountId,
                        f,
                        e.target.value === "grant"
                          ? true
                          : e.target.value === "revoke"
                            ? false
                            : null,
                      ),
                    "Override saved.",
                  )
                }
                ariaLabel={FEATURE_LABELS[f]}
                className="w-36 rounded-md border border-border bg-background px-3 py-2 text-left text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          );
        })}
      </div>

      {/* Fee sponsorship */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-medium text-foreground">
          Sponsored deposit fees
        </p>
        <p className="text-[11px] text-muted-foreground">
          When on, Inklee waives the 3% on this artist&apos;s deposits (they
          keep 100%). Used {eur(overrides.feeSponsoredUsedCents)}
          {overrides.feeSponsorCapCents !== null && remaining !== null
            ? ` of ${eur(overrides.feeSponsorCapCents)} (${eur(remaining)} left)`
            : " (no cap)"}
          .
        </p>
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={feeSponsored}
            onChange={(e) => setFeeSponsored(e.target.checked)}
          />
          Sponsor this artist&apos;s deposit fees
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-muted-foreground">
            Expires (optional)
            <input
              type="date"
              value={feeExpiry}
              onChange={(e) => setFeeExpiry(e.target.value)}
              disabled={!feeSponsored}
              className={`${FIELD} mt-1`}
            />
          </label>
          <label className="block text-[11px] text-muted-foreground">
            Spend cap € (blank = unlimited)
            <input
              type="number"
              min="0"
              step="1"
              value={capEur}
              onChange={(e) => setCapEur(e.target.value)}
              disabled={!feeSponsored}
              placeholder="unlimited"
              className={`${FIELD} mt-1`}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                setFeeSponsorshipAction(accountId, {
                  feeSponsored,
                  feeSponsorExpiresAt: feeSponsored
                    ? dateInputToIso(feeExpiry)
                    : null,
                  feeSponsorCapCents:
                    feeSponsored && capEur.trim() !== ""
                      ? Math.round(parseFloat(capEur) * 100)
                      : null,
                }),
              "Sponsorship saved.",
            )
          }
          className="rounded-full bg-brand-mustard px-4 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Save sponsorship
        </button>
      </div>

      {/* Usage */}
      <div className="space-y-1 border-t border-border pt-4">
        <p className="text-xs font-medium text-foreground">Deposit usage</p>
        <p className="text-[11px] text-muted-foreground">
          {usage.paidDepositCount} paid deposit
          {usage.paidDepositCount === 1 ? "" : "s"} ·{" "}
          {eur(usage.depositVolumeCents)} total volume
        </p>
      </div>

      {/* Admin notes */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-medium text-foreground">Admin notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Internal notes (never shown to the artist)…"
          className={FIELD}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => saveAdminNotesAction(accountId, notes), "Notes saved.")
          }
          className="rounded-full border border-border px-4 py-1.5 text-xs text-foreground hover:bg-muted/30 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Save notes
        </button>
      </div>
    </section>
  );
}
