"use client";

import BrandedDateInput from "@/components/public-booking/branded-date-input";
import { useActionState, startTransition, useState } from "react";
import Link from "next/link";
import FieldArea, { CheckBadge } from "@/components/public-booking/field-area";
import { addDaysToDateKey, localDateKey } from "@/lib/date-utils";
import { HONEYPOT_FIELD } from "@/lib/honeypot";
import { submitFlashBookingAction } from "./actions";

type State = { error: string; field?: string } | null;

const tomorrow = () => addDaysToDateKey(localDateKey(), 1);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // Controlled values for the in-field completion checkmarks.
  const [igVal, setIgVal] = useState("");
  const [emailVal, setEmailVal] = useState("");
  const [placementVal, setPlacementVal] = useState("");
  const [notesVal, setNotesVal] = useState("");
  const igDone = igVal.trim() !== "";
  const emailDone = EMAIL_RE.test(emailVal.trim());
  const placementDone = placementVal.trim() !== "";
  const notesDone = notesVal.trim() !== "";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {state?.error && !state.field && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <input type="hidden" name="flash_item_id" value={flashItemId} />
      {flashDayId && (
        <input type="hidden" name="flash_day_id" value={flashDayId} />
      )}

      <FieldArea gap={24}>
        <div className="space-y-2">
          <label className="text-base text-muted-foreground">
            Your contact <span className="text-foreground">*</span>
          </label>
          <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center gap-2 rounded-md border border-border bg-transparent px-3 py-2.5 text-sm focus-within:ring-1 focus-within:ring-ring">
              <span className="select-none text-muted-foreground">@</span>
              <input
                id="flash_handle"
                name="instagram_handle"
                type="text"
                autoComplete="off"
                placeholder="instagram"
                value={igVal}
                onChange={(e) => setIgVal(e.target.value)}
                className="flex-1 bg-transparent text-foreground focus:outline-none border-0 outline-none shadow-none p-0"
              />
              {igDone && <CheckBadge />}
            </div>
            <span className="text-center text-sm font-medium text-muted-foreground">
              or
            </span>
            <div className="relative">
              <input
                id="flash_email"
                name="email"
                type="email"
                placeholder="email"
                value={emailVal}
                onChange={(e) => setEmailVal(e.target.value)}
                className="w-full rounded-md border border-border bg-transparent py-2.5 pl-3 pr-10 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {emailDone && (
                <CheckBadge className="absolute right-2.5 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>
          {(err("instagram_handle") || err("email")) && (
            <p className="text-sm text-destructive">
              {err("instagram_handle") ?? err("email")}
            </p>
          )}
        </div>
      </FieldArea>

      <FieldArea gap={24}>
        <div className="space-y-1.5">
          <label
            htmlFor="flash_placement"
            className="text-base text-muted-foreground"
          >
            Placement on body <span className="text-foreground">*</span>
          </label>
          <div className="relative">
            <input
              id="flash_placement"
              name="placement"
              type="text"
              required
              placeholder={placementHint ?? "Left forearm, inner wrist…"}
              value={placementVal}
              onChange={(e) => setPlacementVal(e.target.value)}
              className="w-full rounded-md border border-border bg-transparent py-3 pl-3 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {placementDone && (
              <CheckBadge className="absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
          {err("placement") && (
            <p className="text-sm text-destructive">{err("placement")}</p>
          )}
        </div>
      </FieldArea>

      <FieldArea gap={24}>
        <div className="space-y-1.5">
          <label
            htmlFor="flash_date"
            className="text-base text-muted-foreground"
          >
            Preferred date <span className="text-foreground">*</span>
          </label>
          <BrandedDateInput
            id="flash_date"
            name="preferred_date"
            required
            min={tomorrow()}
          />
          {err("preferred_date") && (
            <p className="text-sm text-destructive">{err("preferred_date")}</p>
          )}
        </div>
      </FieldArea>

      <FieldArea gap={24}>
        <div className="space-y-1.5">
          <label
            htmlFor="flash_notes"
            className="text-base text-muted-foreground"
          >
            Additional notes{" "}
            <span className="text-xs text-muted-foreground">(optional)</span>
          </label>
          <div className="relative">
            <textarea
              id="flash_notes"
              name="notes"
              rows={3}
              placeholder="Anything else the artist should know…"
              value={notesVal}
              onChange={(e) => setNotesVal(e.target.value)}
              className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {notesDone && <CheckBadge className="absolute bottom-4 right-3" />}
          </div>
        </div>
      </FieldArea>

      {/* Honeypot */}
      <input
        name={HONEYPOT_FIELD}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-px w-px overflow-hidden -left-[9999px] top-auto"
      />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand-mustard px-5 py-3 text-base font-medium text-brand-charcoal disabled:opacity-50"
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
