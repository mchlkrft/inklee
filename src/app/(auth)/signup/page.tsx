"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction } from "./actions";
import GoogleAuthButton from "@/components/google-auth-button";

type State = { error: string } | { sent: true } | null;

export default function SignupPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    signUpAction,
    null,
  );

  if (state && "sent" in state) {
    return (
      <div className="text-center space-y-2">
        <p className="text-foreground font-medium">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link. Check your spam folder if it doesn&apos;t
          arrive.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          Create account
        </h1>
        <p className="text-sm text-muted-foreground">
          Already have one?{" "}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
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
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            Password
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
          <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? "Creating account..." : "Create account"}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs text-muted-foreground">
            or
          </span>
        </div>
      </div>

      <GoogleAuthButton label="Sign up with Google" />
    </div>
  );
}
