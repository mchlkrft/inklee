"use client";

import { useActionState } from "react";
import { updateProductAction } from "./actions";
import ProductFormFields, {
  type ProductFormFieldValues,
  type VariantInputRow,
} from "./product-form-fields";

type State = { error: string } | { success: true } | null;

export type ProductFormValues = ProductFormFieldValues & { id: string };

// Edit form for /goods/[id]. Create lives in the quick-create modal; both share
// ProductFormFields so the layout stays identical.
export default function ProductForm({
  product,
  variants = [],
}: {
  product: ProductFormValues;
  variants?: VariantInputRow[];
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    updateProductAction,
    null,
  );

  return (
    <form action={action} className="max-w-2xl space-y-6">
      <input type="hidden" name="id" value={product.id} />
      <ProductFormFields initial={product} variants={variants} />

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save product"}
      </button>
    </form>
  );
}
