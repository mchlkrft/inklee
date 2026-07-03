"use client";

import { useActionState } from "react";
import { createTicketAction } from "./actions";
import SelectInput from "@/components/select-input";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_LIMITS,
} from "@/lib/support";

const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map((c) => ({
  value: c,
  label: SUPPORT_CATEGORY_LABELS[c],
}));

type State = { error: string } | { ok: true } | null;

const INPUT_CLS =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const TEXTAREA_CLS = `${INPUT_CLS} resize-y min-h-[88px]`;
const LABEL_CLS = "text-sm font-medium text-foreground";
const HINT_CLS = "text-xs text-muted-foreground";

export default function SupportForm() {
  const [state, action, pending] = useActionState<State, FormData>(
    createTicketAction,
    null,
  );

  return (
    <form action={action} className="space-y-5">
      {state && "error" in state && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="support-subject" className={LABEL_CLS}>
          Subject
        </label>
        <input
          id="support-subject"
          name="subject"
          type="text"
          required
          minLength={SUPPORT_LIMITS.subjectMin}
          maxLength={SUPPORT_LIMITS.subjectMax}
          placeholder="e.g. Clients see an error on my booking page"
          className={INPUT_CLS}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-category" className={LABEL_CLS}>
          Category
        </label>
        <SelectInput
          id="support-category"
          name="category"
          required
          options={CATEGORY_OPTIONS}
          placeholder="Pick a category"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-description" className={LABEL_CLS}>
          What is going wrong?
        </label>
        <p id="support-description-hint" className={HINT_CLS}>
          A clear description, the result you expected, and what happened
          instead will help us investigate faster.
        </p>
        <textarea
          id="support-description"
          name="description"
          required
          minLength={SUPPORT_LIMITS.descriptionMin}
          maxLength={SUPPORT_LIMITS.descriptionMax}
          aria-describedby="support-description-hint"
          placeholder="Describe the problem, when it started, and who it affects."
          className={TEXTAREA_CLS}
          rows={5}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="support-expected" className={LABEL_CLS}>
            What did you expect to happen?
          </label>
          <textarea
            id="support-expected"
            name="expected_behavior"
            required
            minLength={SUPPORT_LIMITS.expectedMin}
            maxLength={SUPPORT_LIMITS.expectedMax}
            placeholder="e.g. The client sees a confirmation page."
            className={TEXTAREA_CLS}
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="support-actual" className={LABEL_CLS}>
            What actually happened?
          </label>
          <textarea
            id="support-actual"
            name="actual_behavior"
            required
            minLength={SUPPORT_LIMITS.actualMin}
            maxLength={SUPPORT_LIMITS.actualMax}
            placeholder="e.g. The page shows a generic error."
            className={TEXTAREA_CLS}
            rows={3}
          />
        </div>
      </div>

      <fieldset className="space-y-5 rounded-md border border-border px-4 py-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Optional details
        </legend>

        <div className="space-y-1.5">
          <label htmlFor="support-steps" className={LABEL_CLS}>
            Steps to reproduce
          </label>
          <textarea
            id="support-steps"
            name="reproduction_steps"
            maxLength={SUPPORT_LIMITS.optionalMax}
            placeholder={"1. Open the calendar\n2. Click a booked day\n3. ..."}
            className={TEXTAREA_CLS}
            rows={3}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="support-area" className={LABEL_CLS}>
              Relevant page or feature
            </label>
            <input
              id="support-area"
              name="relevant_area"
              type="text"
              maxLength={SUPPORT_LIMITS.shortFieldMax}
              placeholder="e.g. Bookings calendar"
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="support-device" className={LABEL_CLS}>
              Device
            </label>
            <input
              id="support-device"
              name="device_info"
              type="text"
              maxLength={SUPPORT_LIMITS.shortFieldMax}
              placeholder="e.g. iPhone 15, Windows laptop"
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="support-platform" className={LABEL_CLS}>
              Browser or app
            </label>
            <input
              id="support-platform"
              name="platform_info"
              type="text"
              maxLength={SUPPORT_LIMITS.shortFieldMax}
              placeholder="e.g. Chrome, Android app"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="support-context" className={LABEL_CLS}>
            Additional context
          </label>
          <textarea
            id="support-context"
            name="additional_context"
            maxLength={SUPPORT_LIMITS.optionalMax}
            placeholder="Anything else that could help, like a booking reference or client name. Never include passwords or card numbers."
            className={TEXTAREA_CLS}
            rows={3}
          />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? "Sending your request…" : "Send support request"}
      </button>
    </form>
  );
}
