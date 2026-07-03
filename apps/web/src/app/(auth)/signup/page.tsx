"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { signUpAction } from "./actions";
import GoogleAuthButton from "@/components/google-auth-button";
import PasswordInput from "@/components/password-input";
import { trackEvent } from "@/lib/track";
import { PASSWORD_RULES_HINT } from "@inklee/shared/auth-validation";

type State = { error: string } | { sent: true } | null;

export default function SignupPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    signUpAction,
    null,
  );
  // Track the email so we can show it back in the success view, and let the
  // user dismiss the success view to try a different address.
  const [email, setEmail] = useState("");
  const [dismissedSuccess, setDismissedSuccess] = useState(false);

  const sent = state !== null && "sent" in state && !dismissedSuccess;

  if (sent) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-mustard/15">
          <Mail className="h-5 w-5 text-brand-mustard" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-medium text-foreground">
            Check your email
          </p>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="text-foreground">{email || "your inbox"}</span>.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => {
              setDismissedSuccess(true);
              setEmail("");
            }}
            className="underline underline-offset-4 hover:text-foreground"
          >
            use a different email
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
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

      <form
        action={action}
        onSubmit={() => trackEvent("signup_started", { method: "email" })}
        className="space-y-4"
      >
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            Password
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
          <label
            htmlFor="password_confirm"
            className="text-sm text-muted-foreground"
          >
            Confirm password
          </label>
          <PasswordInput
            id="password_confirm"
            name="password_confirm"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="text-foreground no-underline">
            Terms
          </Link>
          ,{" "}
          <Link href="/acceptable-use" className="text-foreground no-underline">
            Acceptable Use Policy
          </Link>
          , and{" "}
          <Link href="/dpa" className="text-foreground no-underline">
            Data Processing Agreement
          </Link>
          , and have read our{" "}
          <Link href="/privacy" className="text-foreground no-underline">
            Privacy Policy
          </Link>
          .
        </p>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account"}
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

      <GoogleAuthButton
        label="Sign up with Google"
        onEngage={() => trackEvent("signup_started", { method: "google" })}
      />
    </div>
  );
}
