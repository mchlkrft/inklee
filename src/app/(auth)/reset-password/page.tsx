"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "./actions";

type State = { error: string } | null;

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    resetPasswordAction,
    null,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          set new password
        </h1>
      </div>

      <form action={action} className="space-y-4">
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            new password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm" className="text-sm text-muted-foreground">
            confirm password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "updating…" : "update password"}
        </button>
      </form>
    </div>
  );
}
