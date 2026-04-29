"use client";

import { useActionState, useState } from "react";
import Spinner from "@/components/spinner";
import { saveFormAppearanceAction } from "./actions";
import type { FormAppearance } from "@/lib/books-settings";

type State = { error: string } | { success: true } | null;

const OPTIONS: { value: FormAppearance; label: string; description: string }[] =
  [
    {
      value: "dark",
      label: "Dark",
      description: "Always shows the dark theme.",
    },
    {
      value: "light",
      label: "Light",
      description: "Always shows the light theme.",
    },
    {
      value: "auto",
      label: "Auto",
      description: "Follows the visitor's system preference.",
    },
  ];

export default function FormAppearanceForm({
  current,
}: {
  current: FormAppearance;
}) {
  const [selected, setSelected] = useState<FormAppearance>(current);
  const [state, action, pending] = useActionState<State, FormData>(
    saveFormAppearanceAction,
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <label
              key={opt.value}
              className={`relative flex cursor-pointer flex-col gap-1 rounded-md border-2 px-4 py-3.5 transition-colors ${
                active
                  ? "border-foreground bg-foreground/5"
                  : "border-border hover:border-foreground/40"
              }`}
            >
              <input
                type="radio"
                name="form_appearance"
                value={opt.value}
                checked={active}
                onChange={() => setSelected(opt.value)}
                className="sr-only"
              />
              <span
                className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {opt.label}
                {active && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    active
                  </span>
                )}
              </span>
              <span className="text-sm text-muted-foreground">
                {opt.description}
              </span>
            </label>
          );
        })}
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
        className="rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Save"}
      </button>
    </form>
  );
}
