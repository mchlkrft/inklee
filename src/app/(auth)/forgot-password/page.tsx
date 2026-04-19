"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "./actions";

type State = { error: string } | { sent: true } | null;

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    forgotPasswordAction,
    null,
  );

  if (state && "sent" in state) {
    return (
      <div className="text-center space-y-2">
        <p className="text-foreground font-medium">check your email</p>
        <p className="text-sm text-muted-foreground">
          if that address is registered, a reset link is on its way.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          reset password
        </h1>
        <p className="text-sm text-muted-foreground">
          <Link
            href="/login"
            className="text-foreground underline underline-offset-4"
          >
            back to sign in
          </Link>
        </p>
      </div>

      <form action={action} className="space-y-4">
        {state && "error" in state && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm text-muted-foreground">
            email
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
          className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "sending…" : "send reset link"}
        </button>
      </form>
    </div>
  );
}
