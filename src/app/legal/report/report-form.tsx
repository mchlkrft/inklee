"use client";

import { useActionState } from "react";
import { HONEYPOT_FIELD } from "@/lib/honeypot";
import { submitReportAction, type ReportState } from "./actions";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "illegal_content", label: "Illegal content" },
  { value: "ip_infringement", label: "Intellectual property infringement" },
  { value: "impersonation", label: "Impersonation" },
  { value: "harassment", label: "Harassment or hate" },
  { value: "spam_fraud", label: "Spam or fraud" },
  { value: "other", label: "Other" },
];

export function ReportForm() {
  const [state, action, pending] = useActionState<ReportState, FormData>(
    submitReportAction,
    null,
  );

  if (state && "sent" in state) {
    return (
      <div className="space-y-3 rounded-md border border-border p-4">
        <p className="font-medium text-foreground">Report received</p>
        <p>
          Thank you. Your report reference is{" "}
          <span className="font-mono text-foreground">{state.reference}</span>.
          We&apos;ve sent a confirmation copy to your email. We will review and
          respond within a reasonable time.
        </p>
      </div>
    );
  }

  const fieldError = (field: string) =>
    state && "error" in state && state.field === field ? state.error : null;
  const generalError =
    state && "error" in state && !state.field ? state.error : null;

  return (
    <form action={action} className="space-y-4">
      {generalError && (
        <p className="text-sm text-destructive">{generalError}</p>
      )}

      {/* Honeypot — invisible to humans, autofill-safe field name */}
      <input
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="sr-only"
      />

      <div className="space-y-1.5">
        <label htmlFor="category" className="text-sm text-foreground">
          Category
        </label>
        <select
          id="category"
          name="category"
          required
          defaultValue="illegal_content"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-ring focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {fieldError("category") && (
          <p className="text-xs text-destructive">{fieldError("category")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="url" className="text-sm text-foreground">
          URL(s) of the content
        </label>
        <textarea
          id="url"
          name="url"
          required
          rows={2}
          placeholder="https://inklee.app/…"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
        />
        <p className="text-xs">
          One URL per line. Include the exact page(s) where you saw the content.
        </p>
        {fieldError("url") && (
          <p className="text-xs text-destructive">{fieldError("url")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm text-foreground">
          Why is this content unlawful or violating?
        </label>
        <textarea
          id="description"
          name="description"
          required
          minLength={20}
          maxLength={5000}
          rows={6}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
        />
        <p className="text-xs">
          Be specific. If you are reporting copyright infringement, identify the
          work you own and how this content infringes it.
        </p>
        {fieldError("description") && (
          <p className="text-xs text-destructive">
            {fieldError("description")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reporter_name" className="text-sm text-foreground">
          Your name
        </label>
        <input
          id="reporter_name"
          name="reporter_name"
          type="text"
          required
          autoComplete="name"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
        />
        {fieldError("reporter_name") && (
          <p className="text-xs text-destructive">
            {fieldError("reporter_name")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reporter_email" className="text-sm text-foreground">
          Your email
        </label>
        <input
          id="reporter_email"
          name="reporter_email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
        />
        <p className="text-xs">
          We&apos;ll send a confirmation copy here. Required for everything
          except reports relating to child sexual abuse material — those may be
          submitted anonymously by email to{" "}
          <a
            href="mailto:support@inklee.app"
            className="text-foreground underline underline-offset-4"
          >
            support@inklee.app
          </a>
          .
        </p>
        {fieldError("reporter_email") && (
          <p className="text-xs text-destructive">
            {fieldError("reporter_email")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="good_faith"
          className="flex items-start gap-2 text-sm text-foreground"
        >
          <input
            id="good_faith"
            name="good_faith"
            type="checkbox"
            required
            value="yes"
            className="mt-1"
          />
          <span>
            I declare in good faith that the information in this report is
            accurate and complete.
          </span>
        </label>
        {fieldError("good_faith") && (
          <p className="text-xs text-destructive">{fieldError("good_faith")}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? "Sending…" : "Submit report"}
      </button>
    </form>
  );
}
