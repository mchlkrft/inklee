"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteOwnAccountAction } from "./actions";

// Counsel §9: re-authentication before the irreversible delete, enforced
// server-side via last_sign_in_at freshness. Password users re-enter their
// password (signInWithPassword bumps last_sign_in_at). OAuth-only accounts
// re-verify with their provider: an OAuth round-trip that returns to this page
// and bumps last_sign_in_at. Type-to-confirm is always required.
export default function DeleteAccountSection({
  email,
  hasPassword,
  oauthProvider,
}: {
  email: string;
  hasPassword: boolean;
  oauthProvider: string | null;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [reauthed, setReauthed] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [reauthPending, setReauthPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function reauth() {
    setReauthError(null);
    setReauthPending(true);
    const { error: e } = await createClient().auth.signInWithPassword({
      email,
      password,
    });
    setReauthPending(false);
    if (e) {
      setReauthError("Incorrect password.");
      return;
    }
    setReauthed(true);
  }

  // OAuth-only re-auth: provider round-trip that returns to this page (the
  // callback honours ?next), which bumps last_sign_in_at so the server-side
  // re-auth check passes. State is not preserved across the redirect; the user
  // returns and types DELETE, and the server enforces the freshness window.
  async function reauthOAuth() {
    if (!oauthProvider) return;
    await createClient().auth.signInWithOAuth({
      provider: oauthProvider as "google" | "apple",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings/account`,
      },
    });
  }

  const providerLabel = oauthProvider
    ? oauthProvider.charAt(0).toUpperCase() + oauthProvider.slice(1)
    : "";

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteOwnAccountAction(confirm);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      await createClient().auth.signOut();
      router.replace("/login");
    });
  }

  const reauthNeeded = hasPassword && !reauthed;
  const canDelete = !reauthNeeded && confirm === "DELETE" && !pending;

  return (
    <div className="space-y-3 rounded-md border border-destructive/40 p-4">
      <p className="text-sm text-muted-foreground">
        This permanently deletes your Inklee account — your booking history,
        client data, uploaded photos, and your public page. This cannot be
        undone.
      </p>

      {hasPassword ? (
        reauthed ? (
          <p className="text-sm font-medium text-green-600">
            Identity confirmed.
          </p>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Confirm your password to continue
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full max-w-xs rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={reauth}
                disabled={reauthPending || !password}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground disabled:opacity-50"
              >
                {reauthPending ? "Confirming…" : "Confirm"}
              </button>
            </div>
            {reauthError && (
              <p className="text-sm text-destructive">{reauthError}</p>
            )}
          </div>
        )
      ) : oauthProvider ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Because you sign in with {providerLabel}, re-verify your identity
            before deleting. You return here to confirm.
          </p>
          <button
            type="button"
            onClick={reauthOAuth}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground"
          >
            Re-verify with {providerLabel}
          </button>
        </div>
      ) : null}

      <div className="space-y-2 pt-1">
        <label className="text-xs text-muted-foreground">
          Type DELETE to confirm
        </label>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          className="block w-full max-w-xs rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}
