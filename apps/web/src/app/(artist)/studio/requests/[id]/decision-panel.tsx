"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GS_NOTE_MAX } from "@inklee/shared/guest-spots";
import {
  acceptGuestSpotAction,
  addPrivateNoteAction,
  passGuestSpotAction,
  proposeDatesAction,
} from "../../actions";

const INPUT_CLS =
  "w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export default function DecisionPanel({
  requestId,
  canDecide,
  canPass,
  canPropose,
  retryAccept,
}: {
  requestId: string;
  canDecide: boolean;
  canPass: boolean;
  canPropose: boolean;
  retryAccept: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "propose" | "pass">("none");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMode("none");
      router.refresh();
    });
  };

  const sendNote = () => {
    setNoteError(null);
    startTransition(async () => {
      const result = await addPrivateNoteAction(requestId, note);
      if (result.error) {
        setNoteError(result.error);
        return;
      }
      setNote("");
      router.refresh();
    });
  };

  const anyDecision = canDecide || canPass || canPropose;

  return (
    <div className="space-y-4">
      {anyDecision ? (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            {canDecide ? (
              <button
                type="button"
                onClick={() => run(() => acceptGuestSpotAction(requestId))}
                disabled={pending}
                className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {retryAccept ? "Finish accepting" : "Accept"}
              </button>
            ) : null}
            {canPass ? (
              mode === "pass" ? (
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => run(() => passGuestSpotAction(requestId))}
                    disabled={pending}
                    className="rounded-md bg-brand-red px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Yes, pass
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("none")}
                    disabled={pending}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
                  >
                    Back
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode("pass")}
                  disabled={pending}
                  className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
                >
                  Pass
                </button>
              )
            ) : null}
            {canPropose ? (
              <button
                type="button"
                onClick={() => setMode(mode === "propose" ? "none" : "propose")}
                disabled={pending}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
              >
                Suggest dates
              </button>
            ) : null}
          </div>

          {canDecide && !retryAccept ? (
            <p className="text-xs text-muted-foreground">
              Accepting puts the stay on both calendars right away.
            </p>
          ) : null}
          {retryAccept ? (
            <p className="text-xs text-muted-foreground">
              This acceptance did not finish. Try again to put the stay on both
              calendars.
            </p>
          ) : null}

          {mode === "propose" ? (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-foreground">From</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-foreground">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={INPUT_CLS}
                  />
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-foreground">
                  Message{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={GS_NOTE_MAX}
                  rows={3}
                  placeholder="That week is full, but the one after works."
                  className={INPUT_CLS}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    proposeDatesAction(
                      requestId,
                      startDate,
                      endDate || startDate,
                      message || null,
                    ),
                  )
                }
                disabled={pending}
                className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Send suggestion
              </button>
            </div>
          ) : null}

          {error ? <p className="text-xs text-brand-red">{error}</p> : null}
        </section>
      ) : null}

      <section className="space-y-2 rounded-2xl border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Send the artist a note
        </h2>
        <p className="text-xs text-muted-foreground">
          Pricing, house rules, anything they should know. Only the two of you
          can read it.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={GS_NOTE_MAX}
          rows={3}
          className={INPUT_CLS}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={sendNote}
            disabled={pending || !note.trim()}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
          >
            Send note
          </button>
          {noteError ? (
            <p className="text-xs text-brand-red">{noteError}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
