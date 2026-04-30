"use client";

import DateInput from "@/components/date-input";
import { useActionState, startTransition } from "react";
import Link from "next/link";
import { submitFlashBookingAction } from "./actions";

type State = { error: string; field?: string } | null;

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

export default function FlashBookingForm({
  artistSlug,
  artistFirstName,
  flashItemId,
  flashDayId,
  placementHint,
}: {
  artistSlug: string;
  artistFirstName: string;
  flashItemId: string;
  flashDayId: string | null;
  placementHint: string | null;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    submitFlashBookingAction,
    null,
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("artist_slug", artistSlug);
    startTransition(() => action(fd));
  };

  const err = (field: string) =>
    state && "field" in state && state.field === field ? state.error : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {state?.error && !state.field && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <input type="hidden" name="flash_item_id" value={flashItemId} />
      {flashDayId && (
        <input type="hidden" name="flash_day_id" value={flashDayId} />
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="flash_handle"
          className="text-base text-muted-foreground"
        >
          Instagram handle <span className="text-foreground">*</span>
        </label>
        <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2.5 text-sm focus-within:ring-1 focus-within:ring-ring">
          <span className="select-none text-muted-foreground">@</span>
          <input
            id="flash_handle"
            name="instagram_handle"
            type="text"
            required
            autoComplete="off"
            className="flex-1 bg-transparent text-foreground focus:outline-none border-0 outline-none shadow-none p-0"
          />
        </div>
        {err("instagram_handle") && (
          <p className="text-sm text-destructive">{err("instagram_handle")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="flash_email"
          className="text-base text-muted-foreground"
        >
          Email <span className="text-foreground">*</span>
        </label>
        <input
          id="flash_email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-border bg-transparent px-3 py-3 text-base text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("email") && (
          <p className="text-sm text-destructive">{err("email")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="flash_placement"
          className="text-base text-muted-foreground"
        >
          Placement on body <span className="text-foreground">*</span>
        </label>
        <input
          id="flash_placement"
          name="placement"
          type="text"
          required
          placeholder={placementHint ?? "Left forearm, inner wrist…"}
          className="w-full rounded-md border border-border bg-transparent px-3 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("placement") && (
          <p className="text-sm text-destructive">{err("placement")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="flash_date" className="text-base text-muted-foreground">
          Preferred date <span className="text-foreground">*</span>
        </label>
        <DateInput
          id="flash_date"
          name="preferred_date"
          required
          min={tomorrow()}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("preferred_date") && (
          <p className="text-sm text-destructive">{err("preferred_date")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="flash_notes"
          className="text-base text-muted-foreground"
        >
          Additional notes{" "}
          <span className="text-xs text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="flash_notes"
          name="notes"
          rows={3}
          placeholder="Anything else the artist should know…"
          className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Honeypot */}
      <input
        name="website"
        type="text"
        tabIndex={-1}
        className="hidden"
        aria-hidden
      />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-brand-mustard px-4 py-3 text-base font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? "Sending…" : `Send request to ${artistFirstName}`}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        By submitting, you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
