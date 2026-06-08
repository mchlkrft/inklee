"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteOwnAccountAction } from "./actions";

// Counsel §9: re-authentication before the irreversible delete. Password users
// re-enter their password (verified via signInWithPassword, which also refreshes
// the session); type-to-confirm is always required.
// NOTE: OAuth-only web accounts (no password) currently proceed on type-to-confirm
// alone — adding social re-auth here without losing the page is a documented
// follow-up. The mobile app (the Apple-gated surface) has full provider re-auth.
export default function DeleteAccountSection({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
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
