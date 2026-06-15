"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { forgotPasswordAction } from "./actions";

type State = { error: string } | { sent: true } | null;

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    forgotPasswordAction,
    null,
  );

  if (state && "sent" in state) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-mustard/15">
          <Mail className="h-5 w-5 text-brand-mustard" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-medium text-foreground">
            Check your email
          </p>
          <p className="text-sm text-muted-foreground">
            If that address is registered, a reset link is on its way.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          <Link
            href="/login"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Forgot password?
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter the email on your account and we’ll send you a link to set a new
          one.
        </p>
      </div>

      <form action={action} className="space-y-4">
        {state && "error" in state && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm text-muted-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="text-foreground underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
