"use client";

import Link from "next/link";

export default function SlotsPromptModal({
  onSkip,
  onCancel,
}: {
  onSkip: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onCancel} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-background shadow-xl space-y-5 p-6">
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-foreground">
              Fixed slots mode requires published slots
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              In fixed slots mode clients can only pick from time slots you
              publish. Until you add at least one slot, your booking page will
              appear closed and no one can book.
            </p>
          </div>

          {/* Warning callout */}
          <div className="rounded-md border border-orange-400/40 bg-orange-400/5 px-4 py-3 flex items-start gap-2.5">
            <span className="text-orange-400 text-base shrink-0 mt-0.5">⚠</span>
            <p className="text-sm text-orange-400">
              Your booking page will show as closed until you publish slots.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Link
              href="/bookings/slots"
              className="w-full rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background text-center transition-opacity hover:opacity-80"
              onClick={onSkip}
            >
              Create slots now →
            </Link>
            <button
              onClick={onSkip}
              className="w-full rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              I&apos;ll do it later
            </button>
            <button
              onClick={onCancel}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Cancel — switch back to preferred date
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
