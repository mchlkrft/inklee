"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DateInput from "@/components/date-input";
import Spinner from "@/components/spinner";
import { createFlashDayAction, updateFlashDayAction } from "./actions";

type State = { error: string } | { success: true; id?: string } | null;

type Studio = { id: string; name: string; city: string; country: string };

type InitialValues = {
  id?: string;
  title?: string;
  scheduledOn?: string | null;
  studioId?: string | null;
  location?: string | null;
  description?: string | null;
  status?: string;
  isPublic?: boolean;
};

const EXTERNAL_VENUE = "__external__";

export default function FlashDayForm({
  initial = {},
  studios = [],
}: {
  initial?: InitialValues;
  studios?: Studio[];
}) {
  const isEdit = !!initial.id;
  const router = useRouter();
  const action = isEdit ? updateFlashDayAction : createFlashDayAction;
  const [state, formAction, pending] = useActionState<State, FormData>(
    action,
    null,
  );

  // Picker state: a real studio id, the EXTERNAL_VENUE sentinel, or "" (none)
  const [studioChoice, setStudioChoice] = useState<string>(
    initial.studioId ?? (initial.location ? EXTERNAL_VENUE : ""),
  );
  const [isPublic, setIsPublic] = useState<boolean>(initial.isPublic ?? false);

  if (state && "success" in state && !isEdit && state.id) {
    router.push(`/flash/days/${state.id}`);
  }

  const showExternalText = studioChoice === EXTERNAL_VENUE;
  const studioIdValue =
    studioChoice && studioChoice !== EXTERNAL_VENUE ? studioChoice : "";

  return (
    <form action={formAction} className="space-y-6 max-w-lg">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="studio_id" value={studioIdValue} />
      <input type="hidden" name="is_public" value={String(isPublic)} />

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

      {/* Studio picker — prefers structured studio_id from the artist's
          library, with a fallback to free-text for external venues */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Location{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <select
          value={studioChoice}
          onChange={(e) => setStudioChoice(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">None</option>
          {studios.length > 0 && (
            <optgroup label="Your studios">
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.city ? ` — ${s.city}` : ""}
                  {s.country ? `, ${s.country}` : ""}
                </option>
              ))}
            </optgroup>
          )}
          <option value={EXTERNAL_VENUE}>Other / external venue</option>
        </select>
        {studios.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Add studios in{" "}
            <Link
              href="/travel#studios"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Guest Spots → Studios
            </Link>{" "}
            to pick them here, or use external venue below.
          </p>
        )}
      </div>

      {showExternalText && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            External venue name
          </label>
          <input
            name="location"
            type="text"
            defaultValue={initial.location ?? ""}
            placeholder="Studio name or city"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

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

      {/* Public toggle */}
      <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Visible to clients
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            When on, this day appears as its own shareable page on your public
            site.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          onClick={() => setIsPublic((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            isPublic ? "bg-foreground" : "bg-border"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
              isPublic ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
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
          className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
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
          className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
