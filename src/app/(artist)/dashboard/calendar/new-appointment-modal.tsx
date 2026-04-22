"use client";

import { useState, startTransition } from "react";
import { createAppointmentAction } from "./actions";
import { SIZES } from "@/lib/booking-schema";

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

export default function NewAppointmentModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const result = await createAppointmentAction(fd);
      setSaving(false);
      if ("error" in result) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-background border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="text-sm font-medium text-foreground">
              New appointment
            </span>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xl leading-none"
            >
              x
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="px-5 py-5 space-y-4 max-h-[80vh] overflow-y-auto"
          >
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Instagram handle
              </label>
              <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
                <span className="text-muted-foreground select-none">@</span>
                <input
                  name="customer_handle"
                  type="text"
                  required
                  autoComplete="off"
                  className="flex-1 bg-transparent text-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Date</label>
              <input
                name="preferred_date"
                type="date"
                required
                min={tomorrow()}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Placement</label>
              <input
                name="placement"
                type="text"
                required
                placeholder="Left forearm, inner wrist..."
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Size</label>
              <select
                name="size"
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select size</option>
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Description <span className="text-xs">(optional)</span>
              </label>
              <textarea
                name="description"
                rows={3}
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="send_email"
                  className="accent-foreground"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                />
                <span className="text-sm text-muted-foreground">
                  Send confirmation email to customer
                </span>
              </label>

              {emailEnabled && (
                <input
                  name="customer_email"
                  type="email"
                  placeholder="customer@example.com"
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {saving ? "Adding..." : "Add appointment"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
