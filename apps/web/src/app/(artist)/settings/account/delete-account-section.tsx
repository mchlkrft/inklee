"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteOwnAccountAction } from "./actions";

export default function DeleteAccountSection() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteOwnAccountAction(confirm);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // Account is gone — clear the browser session and leave.
      await createClient().auth.signOut();
      router.replace("/login");
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-destructive/40 p-4">
      <p className="text-sm text-muted-foreground">
        This permanently deletes your Inklee account — your booking history,
        client data, uploaded photos, and your public page. This cannot be
        undone. You can&apos;t delete while you have unresolved paid deposits or
        a pending Stripe balance.
      </p>
      <input
        type="text"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Type DELETE to confirm"
        autoCapitalize="characters"
        autoComplete="off"
        className="w-full max-w-xs rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending || confirm !== "DELETE"}
          className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}
