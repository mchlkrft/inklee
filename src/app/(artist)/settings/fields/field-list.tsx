"use client";

import { useState, useTransition } from "react";
import type { CustomFieldDef } from "@/lib/custom-fields";
import {
  toggleFieldActiveAction,
  reorderFieldAction,
  deleteFieldAction,
} from "./actions";
import FieldForm from "./field-form";

const TYPE_BADGE: Record<string, string> = {
  short_text: "Text",
  long_text: "Textarea",
  number: "Number",
  select: "Dropdown",
  radio: "Radio",
  checkbox: "Checkbox",
  date: "Date",
};

export default function FieldList({ fields }: { fields: CustomFieldDef[] }) {
  const [mode, setMode] = useState<null | "add" | string>(null);
  const [, startTransition] = useTransition();

  function toggle(field: CustomFieldDef) {
    startTransition(async () => {
      await toggleFieldActiveAction(field.id, !field.active);
    });
  }

  function move(id: string, dir: "up" | "down") {
    startTransition(async () => {
      await reorderFieldAction(id, dir);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteFieldAction(id);
    });
  }

  return (
    <div className="space-y-4">
      {fields.length === 0 && mode !== "add" && (
        <p className="text-sm text-muted-foreground">
          No custom fields yet. Add one to extend your booking form.
        </p>
      )}

      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div key={field.id}>
            {mode === field.id ? (
              <FieldForm field={field} onDone={() => setMode(null)} />
            ) : (
              <div className="rounded-md border border-border px-4 py-3 flex items-center gap-3">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => move(field.id, "up")}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors text-xs leading-none"
                    aria-label="Move up"
                  >
                    ^
                  </button>
                  <button
                    type="button"
                    onClick={() => move(field.id, "down")}
                    disabled={idx === fields.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors text-xs leading-none"
                    aria-label="Move down"
                  >
                    v
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-foreground truncate">
                      {field.label}
                    </span>
                    <span className="text-xs border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                      {TYPE_BADGE[field.type] ?? field.type}
                    </span>
                    {field.required && (
                      <span className="text-xs text-foreground">Required</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={field.active}
                  onClick={() => toggle(field)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    field.active ? "bg-foreground" : "bg-border"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                      field.active ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => setMode(field.id)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(`Remove "${field.label}"? This cannot be undone.`)
                    ) {
                      remove(field.id);
                    }
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {mode === "add" ? (
        <FieldForm onDone={() => setMode(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setMode("add")}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        >
          + Add field
        </button>
      )}
    </div>
  );
}
