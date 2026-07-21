"use client";

import { useActionState, useId, useState } from "react";
import { uploadVerificationDocumentAction } from "./actions";
import type { ConnectStatus } from "@/lib/stripe-connect";

// Stripe can ask for a document that the in-app KYC form cannot collect. Custom
// Connect means the artist never visits Stripe, so this upload is their ONLY
// way to clear that requirement.

type State =
  | { ok: true; status: ConnectStatus; requirementsDue: string[] }
  | { error: string }
  | null;

const ACCEPT = "image/jpeg,image/png,application/pdf";
// Mirrors VERIFICATION_DOCUMENT_MAX_BYTES on the server. Checked here too so an
// oversized pick fails instantly with a readable message: past the server
// action body limit Next rejects the request before the action runs, and the
// artist would otherwise see nothing happen at all.
const MAX_BYTES = 10 * 1024 * 1024;

const FILE_INPUT =
  "block w-full text-xs text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-4 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/70";

export default function VerificationDocumentForm({
  kind,
  heading,
  hint,
  required = false,
}: {
  kind: "identity" | "additional";
  heading: string;
  hint: string;
  /** True when Stripe currently lists this document as due. Drives the label
   *  only: the form stays usable either way so an artist can replace a
   *  document Stripe refused. */
  required?: boolean;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    uploadVerificationDocumentAction,
    null,
  );
  const [sizeError, setSizeError] = useState<string | null>(null);
  const constraintsId = useId();
  const frontId = useId();
  const backId = useId();

  const checkSize = (e: React.ChangeEvent<HTMLInputElement>, label: string) => {
    const file = e.target.files?.[0];
    if (file && file.size > MAX_BYTES) {
      setSizeError(
        `${label} is larger than 10 MB. Please choose a smaller file.`,
      );
      e.target.value = "";
      return;
    }
    setSizeError(null);
  };

  const message =
    sizeError ??
    (state && "error" in state ? state.error : null) ??
    (state && "ok" in state
      ? state.status === "active"
        ? "You're verified. Deposits can now be paid by card."
        : "Document sent. Stripe usually reviews it within a few minutes. Use Refresh status to check."
      : null);
  const isError = sizeError !== null || (state !== null && "error" in state);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />

      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {heading}
          {required && (
            <span className="ml-2 rounded-full bg-brand-mustard/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-charcoal dark:text-brand-mustard">
              Needed now
            </span>
          )}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor={frontId}
          className="block text-xs text-muted-foreground"
        >
          Front of the document
        </label>
        <input
          id={frontId}
          name="front"
          type="file"
          accept={ACCEPT}
          required
          aria-describedby={constraintsId}
          onChange={(e) => checkSize(e, "That file")}
          className={FILE_INPUT}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={backId} className="block text-xs text-muted-foreground">
          Back of the document (only if it has one)
        </label>
        <input
          id={backId}
          name="back"
          type="file"
          accept={ACCEPT}
          aria-describedby={constraintsId}
          onChange={(e) => checkSize(e, "That file")}
          className={FILE_INPUT}
        />
      </div>

      <p id={constraintsId} className="text-xs text-muted-foreground">
        JPG, PNG, or PDF, up to 10 MB per file. For a photo, capture the whole
        document in colour with all four corners visible and nothing cropped.
        The file goes straight to Stripe for verification and is not stored by
        Inklee.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Send document to Stripe"}
      </button>

      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}
      >
        {message}
      </p>
    </form>
  );
}
