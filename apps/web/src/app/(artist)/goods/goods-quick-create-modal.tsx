"use client";

import { useActionState, useEffect } from "react";
import { X } from "lucide-react";
import Spinner from "@/components/spinner";
import { createProductAction } from "./actions";
import ProductFormFields from "./product-form-fields";

type State = { error: string } | { success: true } | null;

// Mounted conditionally by the parent (`{open && <GoodsQuickCreateModal/>}`),
// so each open starts fresh and each close discards form state — same pattern as
// the flash quick-create modal.
export default function GoodsQuickCreateModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    createProductAction,
    null,
  );

  useEffect(() => {
    if (state && "success" in state) onClose();
  }, [state, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="goods-create-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <form
          action={formAction}
          className="flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2
              id="goods-create-title"
              className="text-sm font-medium text-foreground"
            >
              New product
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <ProductFormFields />
            {state && "error" in state && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
            >
              {pending ? (
                <Spinner className="mx-auto h-4 w-4" />
              ) : (
                "Create product"
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
