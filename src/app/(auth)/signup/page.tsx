"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction } from "./actions";

type State = { error: string } | { sent: true } | null;

export default function SignupPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    signUpAction,
    null,
  );

  if (state && "sent" in state) {
    return (
      <div className="text-center space-y-2">
        <p className="text-foreground font-medium">check your email</p>
        <p className="text-sm text-muted-foreground">
          we sent a confirmation link. check your spam folder if it doesn&apos;t
          arrive.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          create account
        </h1>
        <p className="text-sm text-muted-foreground">
          already have one?{" "}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-4"
          >
            sign in
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
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">minimum 8 characters</p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "creating account…" : "create account"}
        </button>
      </form>
    </div>
  );
}
