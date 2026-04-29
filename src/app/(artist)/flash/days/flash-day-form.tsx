"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DateInput from "@/components/date-input";
import Spinner from "@/components/spinner";
import { createFlashDayAction, updateFlashDayAction } from "./actions";

type State = { error: string } | { success: true; id?: string } | null;

type InitialValues = {
  id?: string;
  title?: string;
  scheduledOn?: string | null;
  location?: string | null;
  description?: string | null;
  status?: string;
};

export default function FlashDayForm({
  initial = {},
}: {
  initial?: InitialValues;
}) {
  const isEdit = !!initial.id;
  const router = useRouter();
  const action = isEdit ? updateFlashDayAction : createFlashDayAction;
  const [state, formAction, pending] = useActionState<State, FormData>(
    action,
    null,
  );

  if (state && "success" in state && !isEdit && state.id) {
    router.push(`/flash/days/${state.id}`);
  }

  return (
    <form action={formAction} className="space-y-6 max-w-lg">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Title</label>
        <input
          name="title"
          type="text"
          required
          defaultValue={initial.title ?? ""}
          placeholder="e.g. Summer flash day"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Date{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <DateInput
            name="scheduled_on"
            defaultValue={initial.scheduledOn ?? ""}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Status</label>
          <select
            name="status"
            defaultValue={initial.status ?? "upcoming"}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="past">Past</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Location{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          name="location"
          type="text"
          defaultValue={initial.location ?? ""}
          placeholder="Studio name or city"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Description{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          name="description"
          rows={3}
          defaultValue={initial.description ?? ""}
          placeholder="Tell clients what to expect on this day…"
          className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && isEdit && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? (
            <Spinner className="mx-auto h-4 w-4" />
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Create flash day"
          )}
        </button>
        <Link
          href="/flash/days"
          className="rounded-md border border-border px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
