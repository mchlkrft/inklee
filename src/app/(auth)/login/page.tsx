"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction } from "./actions";
import GoogleAuthButton from "@/components/google-auth-button";
import PasswordInput from "@/components/password-input";
import { authErrorMessage } from "@/lib/auth-error";

type State = { error: string } | null;

// Surfaces a URL-redirected auth error (e.g. expired confirmation link).
// Split into a Suspense-wrapped child because `useSearchParams` opts the
// page out of static rendering otherwise.
function UrlErrorBanner() {
  const params = useSearchParams();
  const msg = authErrorMessage(params.get("error"));
  if (!msg) return null;
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/[0.06] px-3 py-2">
      <p className="text-sm text-destructive">{msg}</p>
    </div>
  );
}

export default function LoginPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    loginAction,
    null,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-foreground underline underline-offset-4"
          >
            Sign up
          </Link>
        </p>
      </div>

      <form action={action} className="space-y-4">
        {state?.error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/[0.06] px-3 py-2">
            <p className="text-sm text-destructive">{state.error}</p>
          </div>
        ) : (
          <Suspense fallback={null}>
            <UrlErrorBanner />
          </Suspense>
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

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            Password
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
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

      <GoogleAuthButton label="Continue with Google" />
    </div>
  );
}
