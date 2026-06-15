"use client";

import { useActionState, useState } from "react";
import Spinner from "@/components/spinner";
import { saveBookingPolicyAction } from "./actions";
import { MAX_BOOKING_POLICY } from "@/lib/bio-page-settings";

type State = { error: string } | { success: true } | null;

// Booking policy lives in the shared bio_page model but is a booking-page
// concern (deposit / cancellation / minimum size), so it is edited here and
// rendered on the public booking page, not on the Link Hub.
export default function BookingPolicyForm({
  policy,
  show,
}: {
  policy: string;
  show: boolean;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveBookingPolicyAction,
    null,
  );
  const [value, setValue] = useState(policy);
  const [showOnPage, setShowOnPage] = useState(show);

  return (
    <form action={action} className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="show_policy"
          checked={showOnPage}
          onChange={(e) => setShowOnPage(e.target.checked)}
        />
        Show on your booking page
      </label>
      <textarea
        name="booking_policy"
        rows={5}
        maxLength={MAX_BOOKING_POLICY}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. A deposit holds your date. Deposits are non-refundable but carry to one reschedule with 48 hours notice."
        className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <p className="text-right text-xs text-muted-foreground">
        {value.length}/{MAX_BOOKING_POLICY}
      </p>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Save"}
      </button>
    </form>
  );
}
