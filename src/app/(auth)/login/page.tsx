"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "./actions";

type State = { error: string } | null;

export default function LoginPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    loginAction,
    null,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">sign in</h1>
        <p className="text-sm text-muted-foreground">
          don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-foreground underline underline-offset-4"
          >
            sign up
          </Link>
        </p>
      </div>

      <form action={action} className="space-y-4">
        {state?.error && (
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

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "signing in…" : "sign in"}
        </button>
      </form>
    </div>
  );
}
