"use client";

import { useActionState, useState, useEffect } from "react";
import { CUSTOM_FIELD_TYPES, labelToKey } from "@/lib/custom-fields";
import Spinner from "@/components/spinner";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { createFieldAction, updateFieldAction } from "./actions";

type State = { error: string } | { success: true } | null;
const NEEDS_OPTIONS = new Set(["select", "radio"]);
const NEEDS_PLACEHOLDER = new Set([
  "short_text",
  "long_text",
  "number",
  "date",
]);

const TYPE_LABELS: Record<string, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  select: "Dropdown",
  radio: "Radio group",
  checkbox: "Checkbox",
  date: "Date",
};

export default function FieldForm({
  field,
  onDone,
  allFields = [],
  conditionsEntitled = false,
}: {
  field?: CustomFieldDef;
  onDone: () => void;
  /** Plus gate (P3). When false the artist cannot ADD a condition, but one
   *  that already exists is still shown and still round-trips on save, so an
   *  unrelated edit never silently strips it. */
  conditionsEntitled?: boolean;
  /** Sibling fields, so a condition can name a controlling question. Only
   *  fields EARLIER than this one are offerable (see below). */
  allFields?: CustomFieldDef[];
}) {
  const isEdit = !!field;
  const action = isEdit ? updateFieldAction : createFieldAction;
  const [state, formAction, pending] = useActionState<State, FormData>(
    action,
    null,
  );

  const [label, setLabel] = useState(field?.label ?? "");
  const [key, setKey] = useState(field?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(isEdit);
  const [type, setType] = useState<string>(field?.type ?? "short_text");
  const [options, setOptions] = useState<string[]>(field?.options ?? []);
  const [condKey, setCondKey] = useState<string>(
    field?.condition?.fieldKey ?? "",
  );
  const [condOp, setCondOp] = useState<string>(
    field?.condition?.operator ?? "equals",
  );
  const [condValue, setCondValue] = useState<string>(
    field?.condition?.value ?? "",
  );

  // Offerable controllers: choice fields that come BEFORE this one. Editing an
  // existing field uses its position; a NEW field is appended last, so every
  // existing choice field qualifies.
  const controllerOptions = allFields.filter(
    (f) =>
      f.active &&
      !f.deleted_at &&
      (f.type === "select" || f.type === "radio" || f.type === "checkbox") &&
      f.key !== key &&
      (field ? f.position < field.position : true),
  );
  const controllerField = controllerOptions.find((f) => f.key === condKey);
  const conditionJson = condKey
    ? JSON.stringify({
        fieldKey: condKey,
        operator: condOp,
        value:
          condOp === "equals" || condOp === "not_equals" ? condValue : null,
      })
    : "";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!keyTouched && label) setKey(labelToKey(label));
  }, [label, keyTouched]);

  useEffect(() => {
    if (state && "success" in state) onDone();
  }, [state, onDone]);

  function addOption() {
    setOptions([...options, ""]);
  }
  function updateOption(i: number, val: string) {
    const next = [...options];
    next[i] = val;
    setOptions(next);
  }
  function removeOption(i: number) {
    setOptions(options.filter((_, idx) => idx !== i));
  }

  return (
    <form
      action={formAction}
      className="rounded-md border border-border p-5 space-y-4 bg-surface"
    >
      {isEdit && <input type="hidden" name="id" value={field.id} />}

      {state && "error" in state && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      <input type="hidden" name="key" value={key} />

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Label *</label>
        <input
          name="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          maxLength={100}
          placeholder="e.g. Skin type"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Type *</label>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {CUSTOM_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {NEEDS_OPTIONS.has(type) && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            Options <span className="text-foreground">*</span> (at least 2)
          </label>
          <div className="space-y-1.5">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={100}
                  className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="px-2 text-muted-foreground hover:text-destructive transition-colors text-sm"
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            + Add option
          </button>
          <input type="hidden" name="options" value={JSON.stringify(options)} />
        </div>
      )}

      {NEEDS_PLACEHOLDER.has(type) && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Placeholder{" "}
            <span className="text-muted-foreground text-xs">(optional)</span>
          </label>
          <input
            name="placeholder"
            defaultValue={field?.placeholder ?? ""}
            maxLength={200}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">
          Help text{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </label>
        <input
          name="help_text"
          defaultValue={field?.help_text ?? ""}
          maxLength={500}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          name="required"
          defaultChecked={field?.required ?? false}
          className="accent-foreground"
        />
        <span className="text-sm text-muted-foreground">Required field</span>
      </label>

      {/* Always submitted, even when the editor below is not rendered: the
          update action replaces the stored condition with whatever arrives, so
          an absent input would silently WIPE a condition whenever the artist
          edits a field whose controller is no longer offerable (reordered,
          archived). State is seeded from the stored condition, so that case
          round-trips it untouched. */}
      <input type="hidden" name="condition" value={conditionJson} />

      {/* Conditional questions (P3). Only fields BEFORE this one can control
          it: that makes evaluation a single ordered pass and a cycle
          impossible, rather than needing a cycle check the artist would have
          to understand. Choice fields only, because "equals" against free
          text is a trap nobody wins. */}
      {controllerOptions.length > 0 && !conditionsEntitled && !condKey && (
        <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          Showing a question only when an earlier answer matches is part of
          Plus.
        </p>
      )}

      {controllerOptions.length > 0 && (conditionsEntitled || condKey) && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm text-foreground">
            Only show this question when
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              value={condKey}
              onChange={(e) => {
                setCondKey(e.target.value);
                // The stored answer belongs to the previous question's option
                // list, so keeping it would compare against a value the new
                // one never offers.
                setCondValue("");
                const next = allFields.find((f) => f.key === e.target.value);
                if (next?.type === "checkbox") setCondOp("answered");
              }}
              aria-label="Controlling question"
              className="rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground"
            >
              <option value="">Always show</option>
              {controllerOptions.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            {condKey && (
              <>
                <select
                  value={condOp}
                  onChange={(e) => setCondOp(e.target.value)}
                  aria-label="Condition"
                  className="rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground"
                >
                  {/* A checkbox has no options, so there is nothing for "is"
                      to compare against: ticked / unticked is exactly what
                      answered / not answered mean there. */}
                  {controllerField?.type === "checkbox" ? (
                    <>
                      <option value="answered">is ticked</option>
                      <option value="not_answered">is not ticked</option>
                    </>
                  ) : (
                    <>
                      <option value="equals">is</option>
                      <option value="not_equals">is not</option>
                      <option value="answered">is answered</option>
                      <option value="not_answered">is not answered</option>
                    </>
                  )}
                </select>
                {(condOp === "equals" || condOp === "not_equals") && (
                  <select
                    value={condValue}
                    onChange={(e) => setCondValue(e.target.value)}
                    aria-label="Answer"
                    className="rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">Choose an answer</option>
                    {controllerField?.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>
          {condKey && (
            <p className="text-xs text-muted-foreground">
              Hidden questions are never required, so someone who does not see
              this can still submit the form.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-mustard px-5 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? (
            <Spinner className="w-4 h-4 mx-auto" />
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Add field"
          )}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
