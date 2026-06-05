"use client";

import { useActionState, useState } from "react";
import { saveReminderSettingsAction } from "./actions";
import Spinner from "@/components/spinner";
import type { ReminderSettings } from "@/lib/reminder-settings";

type State = { error: string } | { success: true } | null;

export default function RemindersForm({
  settings,
}: {
  settings: ReminderSettings;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveReminderSettingsAction,
    null,
  );

  const [values, setValues] = useState({ ...settings });

  function toggle(
    key:
      | "deposit_overdue_enabled"
      | "appointment_reminder_enabled"
      | "reconfirmation_enabled",
  ) {
    setValues((v) => ({ ...v, [key]: !v[key] }));
  }

  return (
    <form action={action} className="space-y-6">
      <div className="rounded-md border border-border divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Deposit overdue reminder</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sent to client and artist when a deposit is past due.
            </p>
          </div>
          <input
            type="hidden"
            name="deposit_overdue_enabled"
            value={String(values.deposit_overdue_enabled)}
          />
          <button
            type="button"
            role="switch"
            aria-checked={values.deposit_overdue_enabled}
            onClick={() => toggle("deposit_overdue_enabled")}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${values.deposit_overdue_enabled ? "bg-foreground" : "bg-border"}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transform transition-transform ${values.deposit_overdue_enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
      </div>

      <div className="rounded-md border border-border divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Appointment reminder</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sent to client before their appointment.
            </p>
          </div>
          <input
            type="hidden"
            name="appointment_reminder_enabled"
            value={String(values.appointment_reminder_enabled)}
          />
          <button
            type="button"
            role="switch"
            aria-checked={values.appointment_reminder_enabled}
            onClick={() => toggle("appointment_reminder_enabled")}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${values.appointment_reminder_enabled ? "bg-foreground" : "bg-border"}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transform transition-transform ${values.appointment_reminder_enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
        {values.appointment_reminder_enabled && (
          <div className="flex items-center justify-between px-4 py-3">
            <label
              htmlFor="appointment_days"
              className="text-sm text-muted-foreground"
            >
              Send how many days before?
            </label>
            <div className="flex items-center gap-2">
              <input
                id="appointment_days"
                name="appointment_reminder_days"
                type="number"
                min={1}
                max={14}
                value={values.appointment_reminder_days}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    appointment_reminder_days: parseInt(e.target.value) || 3,
                  }))
                }
                className="w-16 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">Days</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Reconfirmation request</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Asks the client to confirm they&apos;re still coming, with a fresh
              cancel link.
            </p>
          </div>
          <input
            type="hidden"
            name="reconfirmation_enabled"
            value={String(values.reconfirmation_enabled)}
          />
          <button
            type="button"
            role="switch"
            aria-checked={values.reconfirmation_enabled}
            onClick={() => toggle("reconfirmation_enabled")}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${values.reconfirmation_enabled ? "bg-foreground" : "bg-border"}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transform transition-transform ${values.reconfirmation_enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
        {values.reconfirmation_enabled && (
          <div className="flex items-center justify-between px-4 py-3">
            <label
              htmlFor="reconfirmation_days"
              className="text-sm text-muted-foreground"
            >
              Send how many days before?
            </label>
            <div className="flex items-center gap-2">
              <input
                id="reconfirmation_days"
                name="reconfirmation_days"
                type="number"
                min={3}
                max={30}
                value={values.reconfirmation_days}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    reconfirmation_days: parseInt(e.target.value) || 14,
                  }))
                }
                className="w-16 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">Days</span>
            </div>
          </div>
        )}
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Save"}
      </button>
    </form>
  );
}
