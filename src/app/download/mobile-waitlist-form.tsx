"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Mail, Check } from "lucide-react";
import { joinMobileWaitlistAction } from "./actions";
import type { MobileWaitlistFormResult } from "@/lib/mobile-waitlist";

/** Email capture for the /download page launch waitlist.
 *
 *  Two visual variants:
 *   - `bone` (default): bone background, charcoal text, mustard CTA.
 *   - `charcoal`: dark surface (used in the final-CTA section), bone text,
 *     mustard CTA. Same logic, different palette tokens.
 */
type Variant = "bone" | "charcoal";

export default function MobileWaitlistForm({
  variant = "bone",
  formId = "mobile-waitlist-top",
}: {
  variant?: Variant;
  /** Unique id per form instance so labels + inputs pair correctly when
   *  the page renders the form in two places (top hero + bottom CTA). */
  formId?: string;
}) {
  const [state, formAction] = useActionState<
    MobileWaitlistFormResult | null,
    FormData
  >(joinMobileWaitlistAction, null);

  const isSuccess = state && "success" in state && state.success;
  const errorMsg = state && "error" in state ? state.error : null;

  // Token-driven theming. Bone variant uses charcoal-on-bone; charcoal
  // variant inverts. Mustard CTA + ring stay constant — that's the brand.
  const palette =
    variant === "charcoal"
      ? {
          input:
            "bg-brand-charcoal/40 border-shell-border text-shell-fg placeholder:text-shell-fg-mute focus:border-brand-mustard",
          help: "text-shell-fg-dim",
          success: "text-shell-fg",
        }
      : {
          input:
            "bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-brand-charcoal",
          help: "text-muted-foreground",
          success: "text-foreground",
        };

  if (isSuccess) {
    return (
      <div
        className={`flex items-center gap-3 rounded-full border border-brand-mustard/60 bg-brand-mustard/15 px-5 py-3 ${palette.success}`}
        role="status"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-mustard text-brand-charcoal">
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
        </span>
        <span className="text-sm font-medium">
          You&apos;re on the list. We&apos;ll email you when the app ships.
        </span>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <label htmlFor={`${formId}-email`} className="sr-only">
          Your email
        </label>
        <div
          className={`flex flex-1 items-center rounded-full border ${palette.input} px-5 py-3 transition-colors focus-within:ring-2 focus-within:ring-brand-mustard/40`}
        >
          <Mail
            className="mr-3 h-4 w-4 shrink-0 opacity-60"
            aria-hidden="true"
          />
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@studio.com"
            className="w-full bg-transparent text-base focus:outline-none"
            aria-describedby={`${formId}-help`}
          />
        </div>
        <SubmitButton />
      </div>
      <p id={`${formId}-help`} className={`text-xs ${palette.help}`}>
        One launch email. No newsletter, no marketing list.
      </p>
      {errorMsg && (
        <p className="text-xs text-brand-red" role="alert">
          {errorMsg}
        </p>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity disabled:opacity-60"
    >
      {pending ? "Saving…" : "Notify me"}
    </button>
  );
}
