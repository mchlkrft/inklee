"use client";

import { useActionState } from "react";
import Link from "next/link";
import { changePasswordAction } from "./actions";
import { logoutAction } from "@/app/(auth)/signup/actions";

type State = { error: string } | { success: true } | null;

export default function SecurityForm({
  hasPassword,
}: {
  hasPassword: boolean;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    changePasswordAction,
    null,
  );

  return (
    <div className="space-y-6">
      {hasPassword ? (
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="current_password"
              className="text-sm text-muted-foreground"
            >
              Current password
            </label>
            <input
              id="current_password"
              name="current_password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="new_password"
              className="text-sm text-muted-foreground"
            >
              New password
            </label>
            <input
              id="new_password"
              name="new_password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Minimum 8 characters
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="confirm_password"
              className="text-sm text-muted-foreground"
            >
              Confirm new password
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {state && "error" in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          {state && "success" in state && (
            <p className="text-sm text-muted-foreground">Password updated.</p>
          )}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
            >
              {pending ? "Updating…" : "Update password"}
            </button>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Forgot current password?
            </Link>
          </div>
        </form>
      ) : (
        <div className="rounded-md border border-border px-4 py-4 space-y-2">
          <p className="text-sm text-foreground">No password set</p>
          <p className="text-xs text-muted-foreground">
            Your account uses Google sign-in. Password authentication is not
            enabled.
          </p>
        </div>
      )}

      <div className="pt-4 border-t border-border space-y-2">
        <p className="text-sm text-muted-foreground">Session</p>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
