"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "./actions";
import PasswordInput from "@/components/password-input";
import { PASSWORD_RULES_HINT } from "@inklee/shared/auth-validation";

type State = { error: string } | null;

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    resetPasswordAction,
    null,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Set a new password
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter a new password for your account. You’ll be signed in afterwards.
        </p>
      </div>

      <form action={action} className="space-y-4">
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            New password
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">{PASSWORD_RULES_HINT}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm" className="text-sm text-muted-foreground">
            Confirm password
          </label>
          <PasswordInput
            id="confirm"
            name="confirm"
            autoComplete="new-password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
