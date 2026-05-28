"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import GoodsQuickCreateModal from "./goods-quick-create-modal";

/**
 * "Add product" entry point on /goods. Opens the quick-create modal inline (no
 * navigation), matching the flash "+ New design" pattern. `label` lets the empty
 * state reuse the same trigger with different copy.
 */
export default function GoodsNewButton({
  label = "Add product",
}: {
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-mustard px-3.5 py-2 text-sm font-medium text-brand-charcoal"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {label}
      </button>
      {open && <GoodsQuickCreateModal onClose={() => setOpen(false)} />}
    </>
  );
}
