"use client";

import { useActionState } from "react";
import Spinner from "@/components/spinner";
import {
  PROJECT_STATUS_META,
  PROJECT_TRANSITIONS,
  PROJECT_NOTE_MAX,
  type ProjectStatus,
} from "@inklee/shared/projects";
import {
  setProjectStatusAction,
  saveProjectNoteAction,
  linkBookingAction,
} from "../actions";

type State = { error: string } | { success: true } | null;

export function StatusControls({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    setProjectStatusAction,
    null,
  );
  // Only the transitions the state machine actually permits are offered, so a
  // refusal is never something the artist discovers by clicking.
  const next = PROJECT_TRANSITIONS[status] ?? [];

  return (
    <div className="space-y-2">
      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <form key={s} action={action}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="status" value={s} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
            >
              {pending ? (
                <Spinner className="w-3 h-3" />
              ) : (
                `Move to ${PROJECT_STATUS_META[s].label.toLowerCase()}`
              )}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

export function NoteForm({
  projectId,
  note,
}: {
  projectId: string;
  note: string | null;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveProjectNoteAction,
    null,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <textarea
        name="note"
        rows={4}
        defaultValue={note ?? ""}
        maxLength={PROJECT_NOTE_MAX}
        placeholder="Your own notes. The client never sees these."
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-brand-green">Saved.</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Save note"}
      </button>
    </form>
  );
}

export function LinkBookingForm({
  projectId,
  candidates,
}: {
  projectId: string;
  /** Unlinked bookings from the same client, newest first. */
  candidates: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    linkBookingAction,
    null,
  );

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No other bookings from this client to attach.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <select
        name="bookingId"
        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        aria-label="Booking to attach"
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
      >
        {pending ? <Spinner className="w-3 h-3" /> : "Attach as a session"}
      </button>
      {state && "error" in state && (
        <p className="w-full text-sm text-destructive">{state.error}</p>
      )}
    </form>
  );
}

export function UnlinkButton({
  projectId,
  bookingId,
}: {
  projectId: string;
  bookingId: string;
}) {
  const [, action, pending] = useActionState<State, FormData>(
    linkBookingAction,
    null,
  );
  return (
    <form action={action}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="unlink" value="1" />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
      >
        Detach
      </button>
    </form>
  );
}
