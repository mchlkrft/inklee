"use client";

import { startTransition, useActionState, useState } from "react";
import Spinner from "@/components/spinner";
import { createStudioAction, deleteStudioAction } from "./actions";

type Studio = {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string | null;
};
type State = { error: string } | { success: true } | null;

function AddStudioForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, action, pending] = useActionState<State, FormData>(
    createStudioAction,
    null,
  );

  if (state && "success" in state) {
    onSuccess();
  }

  return (
    <form action={action} className="space-y-3 pt-3 border-t border-border">
      <p className="text-sm font-medium text-foreground">Add studio</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Name</label>
          <input
            name="name"
            type="text"
            required
            placeholder="e.g. Ink & Iron"
            className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">City</label>
          <input
            name="city"
            type="text"
            required
            placeholder="Berlin"
            className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Country</label>
          <input
            name="country"
            type="text"
            required
            placeholder="Germany"
            className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">
          Address <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          name="address"
          type="text"
          placeholder="Street address"
          className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md border-2 border-border px-4 py-2 text-sm text-foreground hover:border-foreground transition-colors disabled:opacity-50"
      >
        {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Save studio"}
      </button>
    </form>
  );
}

export default function StudioList({ studios }: { studios: Studio[] }) {
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function handleDelete(id: string) {
    if (!confirm("Remove this studio from your library?")) return;
    setDeleting(id);
    startTransition(async () => {
      await deleteStudioAction(id);
      setDeleting(null);
    });
  }

  return (
    <div className="rounded-md border-2 border-border px-5 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-foreground">
            Studio library
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reusable studios you can attach to any trip date.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      {studios.length > 0 && (
        <div className="divide-y divide-border rounded-md border-2 border-border">
          {studios.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {s.city}, {s.country}
                  {s.address ? ` · ${s.address}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={deleting === s.id}
                onClick={() => handleDelete(s.id)}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0 disabled:opacity-40"
              >
                {deleting === s.id ? "…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}

      {studios.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">
          No studios saved yet. Studios you add here can be attached to trip
          dates.
        </p>
      )}

      {showForm && <AddStudioForm onSuccess={() => setShowForm(false)} />}
    </div>
  );
}
