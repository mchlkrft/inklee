"use client";

import { useActionState } from "react";
import { updateGrowthSettingAction } from "./actions";

// Mirrors the action's state union (not importable: "use server" files must
// not re-export types).
type State = { error: string } | { ok: true } | null;

/**
 * One inline form per setting row: hidden key + a single value input.
 * The server action re-validates everything; this leaf only handles
 * pending/error/saved presentation.
 */
export default function SettingsForm({
  settingKey,
  currentValue,
  inputType,
}: {
  settingKey: string;
  currentValue: string | number;
  inputType: "text" | "number";
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    updateGrowthSettingAction,
    null,
  );

  return (
    <form
      action={action}
      className="flex flex-col items-start gap-1 sm:items-end"
    >
      <div className="flex items-center gap-2">
        <input type="hidden" name="key" value={settingKey} />
        <input
          type={inputType}
          name="value"
          defaultValue={currentValue}
          required
          step={inputType === "number" ? 1 : undefined}
          aria-label={`Value for ${settingKey}`}
          className={`rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums text-foreground ${
            inputType === "text" ? "w-44" : "w-24"
          }`}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {!pending && state && "error" in state && (
        <p className="text-xs text-brand-red">{state.error}</p>
      )}
      {!pending && state && "ok" in state && (
        <p className="text-xs text-brand-green">Saved.</p>
      )}
    </form>
  );
}
