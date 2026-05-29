"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import Spinner from "@/components/spinner";
import { updateProductAction, loadProductForEditAction } from "./actions";
import ProductFormFields, {
  type ProductFormFieldValues,
  type VariantInputRow,
} from "./product-form-fields";
import DeleteProductButton from "./delete-product-button";

type State = { error: string } | { success: true } | null;
type Loaded = {
  product: ProductFormFieldValues & { id: string };
  variants: VariantInputRow[];
};

// Inline edit modal for /goods — opened from a grid tile instead of navigating
// to a subpage. Mirrors the quick-create modal's chrome; the grid tile only has
// thumbnail data, so the full product + variants are fetched when it opens.
export default function GoodsEditModal({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    updateProductAction,
    null,
  );
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadProductForEditAction(productId).then((res) => {
      if (!active) return;
      if ("error" in res) setLoadError(res.error);
      else setLoaded(res);
    });
    return () => {
      active = false;
    };
  }, [productId]);

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
        aria-labelledby="goods-edit-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <form
          action={formAction}
          className="flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2
              id="goods-edit-title"
              className="text-sm font-medium text-foreground"
            >
              Edit product
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
            {loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : !loaded ? (
              <div className="flex justify-center py-10">
                <Spinner className="h-5 w-5" />
              </div>
            ) : (
              <>
                <input type="hidden" name="id" value={loaded.product.id} />
                <ProductFormFields
                  initial={loaded.product}
                  variants={loaded.variants}
                />
                {state && "error" in state && (
                  <p className="text-sm text-destructive">{state.error}</p>
                )}
                <div className="border-t border-border pt-4">
                  <DeleteProductButton id={loaded.product.id} />
                </div>
              </>
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
              disabled={pending || !loaded}
              className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
            >
              {pending ? (
                <Spinner className="mx-auto h-4 w-4" />
              ) : (
                "Save product"
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
