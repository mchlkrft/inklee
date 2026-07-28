"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProductAction } from "./actions";

export default function DeleteProductButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [archivedNotice, setArchivedNotice] = useState(false);

  // The order guard converted the delete into an archive: explain the outcome
  // (it is not an error), then return to the list where the product now shows
  // as archived.
  if (archivedNotice) {
    return (
      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-sm text-foreground">
          This product has orders, so it was archived instead of deleted.
          Archived products stay out of your shop and don&apos;t count toward
          your product limit.
        </p>
        <button
          type="button"
          onClick={() => router.push("/goods")}
          className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to goods
        </button>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-muted-foreground transition-colors hover:text-destructive"
      >
        Delete product
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-destructive/50 p-3">
      <p className="text-sm text-foreground">
        Delete this product? This cannot be undone.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await deleteProductAction(id);
              if (result && "error" in result) {
                setError(result.error);
                return;
              }
              if (result && "archived" in result && result.archived) {
                setArchivedNotice(true);
                return;
              }
              router.push("/goods");
            })
          }
          className="rounded-full bg-destructive px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
