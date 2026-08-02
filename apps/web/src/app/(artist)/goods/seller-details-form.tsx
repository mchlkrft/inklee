"use client";

import { useActionState } from "react";
import { saveSellerDetailsAction } from "./actions";

type State = { error: string } | { success: true } | null;

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const LABEL = "text-sm text-muted-foreground";

// C1.1 counsel prerequisite: the artist's seller identity, rendered verbatim
// into the checkout disclosure block and every order receipt once the shop
// is on. Kept separate from the account-level name (settings/account) since
// a trading name and a display name can legitimately differ, and this is a
// commerce-law requirement rather than a profile preference.
export default function SellerDetailsForm({
  tradingName,
  address,
  contact,
  complete,
}: {
  tradingName: string;
  address: string;
  contact: string;
  complete: boolean;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveSellerDetailsAction,
    null,
  );

  return (
    <div className="space-y-3 rounded-[20px] border border-border p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Seller details</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Shown to buyers at checkout and on their receipt, as the law requires
          for anyone selling goods online.{" "}
          {!complete &&
            "Your standalone shop stays off until all three are filled in."}
        </p>
      </div>
      <form action={action} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="sd-name" className={LABEL}>
            Trading name
          </label>
          <input
            id="sd-name"
            name="seller_trading_name"
            defaultValue={tradingName}
            placeholder="e.g. Mika Ink Studio"
            className={INPUT}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sd-address" className={LABEL}>
            Address
          </label>
          <input
            id="sd-address"
            name="seller_address"
            defaultValue={address}
            placeholder="Street, city, country"
            className={INPUT}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sd-contact" className={LABEL}>
            Contact for buyer questions
          </label>
          <input
            id="sd-contact"
            name="seller_contact"
            defaultValue={contact}
            placeholder="you@example.com"
            className={INPUT}
          />
        </div>

        {state && "error" in state && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state && "success" in state && (
          <p className="text-sm text-muted-foreground">Saved.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
