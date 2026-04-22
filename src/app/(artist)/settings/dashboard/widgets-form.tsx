"use client";

import { useActionState, useState } from "react";
import { saveDashboardWidgetsAction } from "./actions";
import type { DashboardWidgets } from "@/lib/dashboard-settings";

type State = { error: string } | { success: true } | null;

const WIDGET_LABELS: Record<keyof DashboardWidgets, string> = {
  pending_requests: "Pending requests",
  upcoming_appointments: "Upcoming appointments",
  books_status: "Books status",
  waitlist: "Waitlist",
  booking_link: "Booking link",
};

export default function DashboardWidgetsForm({
  widgets,
}: {
  widgets: DashboardWidgets;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveDashboardWidgetsAction,
    null,
  );

  const [values, setValues] = useState<DashboardWidgets>({ ...widgets });

  function toggle(key: keyof DashboardWidgets) {
    setValues((v) => ({ ...v, [key]: !v[key] }));
  }

  return (
    <form action={action} className="space-y-4">
      {(Object.keys(values) as Array<keyof DashboardWidgets>).map((key) => (
        <div
          key={key}
          className="flex items-center justify-between rounded-md border border-border px-4 py-3"
        >
          <p className="text-sm text-foreground">{WIDGET_LABELS[key]}</p>
          <div className="flex items-center gap-2">
            <input type="hidden" name={key} value={String(values[key])} />
            <button
              type="button"
              role="switch"
              aria-checked={values[key]}
              onClick={() => toggle(key)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                values[key] ? "bg-foreground" : "bg-border"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transform transition-transform ${
                  values[key] ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      ))}

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
