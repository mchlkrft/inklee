"use client";

import { useActionState } from "react";
import { uploadVerificationDocumentAction } from "./actions";
import type { ConnectStatus } from "@/lib/stripe-connect";

// Stripe can ask for a document that the in-app KYC form cannot collect. Custom
// Connect means the artist never visits Stripe, so this upload is their ONLY
// way to clear that requirement. Rendered by the payouts page only when Stripe
// currently asks for one.

type State =
  | { ok: true; status: ConnectStatus; requirementsDue: string[] }
  | { error: string }
  | null;

const FILE_INPUT =
  "block w-full text-xs text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-4 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/70";

export default function VerificationDocumentForm({
  kind,
  heading,
  hint,
}: {
  kind: "identity" | "additional";
  heading: string;
  hint: string;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    uploadVerificationDocumentAction,
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />

      <div>
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor={`${kind}-front`}
          className="block text-xs text-muted-foreground"
        >
          Front of the document
        </label>
        <input
          id={`${kind}-front`}
          name="front"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className={FILE_INPUT}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor={`${kind}-back`}
          className="block text-xs text-muted-foreground"
        >
          Back of the document (only if it has one)
        </label>
        <input
          id={`${kind}-back`}
          name="back"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className={FILE_INPUT}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        JPG, PNG, or WEBP, up to 10 MB per image. A colour photo of the whole
        document, with all four corners visible and nothing cropped. The image
        goes straight to Stripe for verification and is not stored by Inklee.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Send document to Stripe"}
      </button>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="text-sm text-muted-foreground">
          {state.status === "active"
            ? "You're verified. Deposits can now be paid by card."
            : "Document sent. Stripe usually reviews it within a few minutes. Use Refresh status to check."}
        </p>
      )}
    </form>
  );
}
