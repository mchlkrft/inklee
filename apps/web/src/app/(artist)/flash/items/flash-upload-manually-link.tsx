"use client";

import { useState } from "react";
import FlashQuickCreateModal from "./flash-quick-create-modal";

/**
 * Small "Or upload a design manually" link for the FlashEmptyState branches.
 *
 * Same modal as the main "+ New design" button uses — extracted so the
 * empty-state CTAs don't have to navigate to a (now-redirecting) /flash/items/new
 * page and lose context.
 */
export default function FlashUploadManuallyLink() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Or upload a design manually
      </button>
      {open && <FlashQuickCreateModal onClose={() => setOpen(false)} />}
    </>
  );
}
