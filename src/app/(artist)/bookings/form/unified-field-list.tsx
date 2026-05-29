"use client";

import { useState, useTransition, useRef } from "react";
import type { FormSettings } from "@/lib/form-settings";
import type { CustomFieldDef } from "@/lib/custom-fields";
import {
  saveFormSettingsAction,
  saveFieldOrderAction,
} from "./form-settings-actions";
import { toggleFieldActiveAction, deleteFieldAction } from "./actions";
import FieldForm from "./field-form";

// ── Standard field config ─────────────────────────────────────────────────────

type SubToggle = { key: keyof FormSettings; label: string };
type StdConfig = {
  id: string;
  label: string;
  toggleKey?: keyof FormSettings; // visibility toggle; omitted = always shown
  requiredKey?: keyof FormSettings; // "Required" toggle; omitted = none
  lockedRequired?: boolean; // email: always shown + always required
  extraSubs?: SubToggle[]; // additional in-row toggles (e.g. photo annotations)
};

const STD: StdConfig[] = [
  {
    id: "instagram_handle",
    label: "Instagram handle",
    toggleKey: "show_instagram_handle",
    requiredKey: "require_instagram_handle",
  },
  { id: "email", label: "Email", lockedRequired: true },
  {
    id: "reference_link",
    label: "Reference link",
    toggleKey: "show_reference_link",
    requiredKey: "require_reference_link",
  },
  {
    id: "placement",
    label: "Placement",
    toggleKey: "show_placement",
    requiredKey: "require_placement",
  },
  {
    id: "size",
    label: "Size",
    toggleKey: "show_size",
    requiredKey: "require_size",
  },
  {
    id: "description",
    label: "Description",
    toggleKey: "show_description",
    requiredKey: "require_description",
  },
  {
    id: "image_upload",
    label: "Reference images",
    toggleKey: "show_image_upload",
    requiredKey: "require_image_upload",
    extraSubs: [{ key: "allow_photo_annotations", label: "Photo annotations" }],
  },
  {
    id: "preferred_date",
    label: "Preferred date / slot",
  },
];

const STD_MAP = new Map(STD.map((s) => [s.id, s]));

const TYPE_BADGE: Record<string, string> = {
  short_text: "Text",
  long_text: "Textarea",
  number: "Number",
  select: "Dropdown",
  radio: "Radio",
  checkbox: "Checkbox",
  date: "Date",
};

// ── Row type ──────────────────────────────────────────────────────────────────

type Row =
  | { kind: "std"; id: string }
  | { kind: "custom"; field: CustomFieldDef };

function buildRows(order: string[], customFields: CustomFieldDef[]): Row[] {
  const rows: Row[] = [];
  const usedStd = new Set<string>();
  const usedCustom = new Set<string>();

  for (const key of order) {
    if (STD_MAP.has(key)) {
      rows.push({ kind: "std", id: key });
      usedStd.add(key);
    } else {
      const cf = customFields.find((f) => f.id === key);
      if (cf) {
        rows.push({ kind: "custom", field: cf });
        usedCustom.add(key);
      }
    }
  }

  // Append any standard fields not yet in the order (backwards compat / new fields)
  for (const s of STD) {
    if (!usedStd.has(s.id)) rows.push({ kind: "std", id: s.id });
  }
  // Append any custom fields not yet in the order
  for (const cf of customFields) {
    if (!usedCustom.has(cf.id)) rows.push({ kind: "custom", field: cf });
  }

  return rows;
}

// ── Shared Toggle ─────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
        checked ? "bg-foreground" : "bg-border"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Grip icon ─────────────────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg
      width="12"
      height="16"
      viewBox="0 0 12 16"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="3" cy="3" r="1.4" />
      <circle cx="9" cy="3" r="1.4" />
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="9" cy="8" r="1.4" />
      <circle cx="3" cy="13" r="1.4" />
      <circle cx="9" cy="13" r="1.4" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UnifiedFieldList({
  initialSettings,
  customFields,
  initialOrder,
}: {
  initialSettings: FormSettings;
  customFields: CustomFieldDef[];
  initialOrder: string[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [order, setOrder] = useState(initialOrder);
  const [activeMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(customFields.map((f) => [f.id, f.active])),
  );
  const [localActive, setLocalActive] =
    useState<Record<string, boolean>>(activeMap);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [, startTransition] = useTransition();

  // ── Drag state ──────────────────────────────────────────────────────────────
  const dragIdx = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const rows = buildRows(order, customFields);

  // ── Setting updates ─────────────────────────────────────────────────────────

  function updateSetting(key: keyof FormSettings, value: boolean) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    startTransition(async () => {
      await saveFormSettingsAction(key, value);
    });
  }

  function updateFieldActive(id: string, active: boolean) {
    setLocalActive((prev) => ({ ...prev, [id]: active }));
    startTransition(async () => {
      await toggleFieldActiveAction(id, active);
    });
  }

  function removeField(id: string) {
    const newOrder = order.filter((k) => k !== id);
    setOrder(newOrder);
    startTransition(async () => {
      await deleteFieldAction(id);
    });
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────

  function onDragStart(e: React.DragEvent, idx: number) {
    dragIdx.current = idx;
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overIdx !== idx) setOverIdx(idx);
  }

  function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const src = dragIdx.current;
    dragIdx.current = null;
    setOverIdx(null);
    if (src === null || src === idx) return;

    // Build the current order from rows (which may include fields not in saved order yet)
    const currentOrderKeys = rows.map((r) =>
      r.kind === "std" ? r.id : r.field.id,
    );
    const newKeys = [...currentOrderKeys];
    const [moved] = newKeys.splice(src, 1);
    newKeys.splice(idx, 0, moved);

    setOrder(newKeys);
    setDraggingIdx(null);
    startTransition(async () => {
      await saveFieldOrderAction(newKeys);
    });
  }

  function onDragEnd() {
    dragIdx.current = null;
    setDraggingIdx(null);
    setOverIdx(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="rounded-md overflow-hidden border border-border divide-y divide-border">
        {rows.map((row, idx) => {
          const isOver = overIdx === idx;
          const dragging = draggingIdx === idx;

          // ── Standard field row ──────────────────────────────────────────────
          if (row.kind === "std") {
            const cfg = STD_MAP.get(row.id)!;
            const hasShow = !!cfg.toggleKey;
            const isOn = hasShow ? settings[cfg.toggleKey!] : true;
            // Sub-toggles shown beneath the label when the field is on: the
            // per-field "Required" toggle first, then any extras (annotations).
            const subs: SubToggle[] = [
              ...(cfg.requiredKey
                ? [{ key: cfg.requiredKey, label: "Required" }]
                : []),
              ...(cfg.extraSubs ?? []),
            ];

            return (
              <div
                key={row.id}
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDragLeave={() => setOverIdx(null)}
                onDrop={(e) => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-3 px-3 py-3 transition-colors ${
                  isOver ? "bg-muted/40" : "bg-background"
                } ${dragging ? "opacity-40" : ""} ${!isOn ? "opacity-60" : ""}`}
              >
                <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                  <GripIcon />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm ${isOn ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground/50 border border-border/50 rounded px-1.5 py-0.5 leading-none">
                      Standard
                    </span>
                    {cfg.lockedRequired && (
                      <span className="text-xs text-muted-foreground/60">
                        Always required
                      </span>
                    )}
                  </div>
                  {isOn && subs.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      {subs.map((s) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {s.label}
                          </span>
                          <Toggle
                            checked={settings[s.key]}
                            onChange={(v) => updateSetting(s.key, v)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {hasShow ? (
                  <Toggle
                    checked={settings[cfg.toggleKey!]}
                    onChange={(v) => updateSetting(cfg.toggleKey!, v)}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground/50 shrink-0">
                    Always on
                  </span>
                )}
              </div>
            );
          }

          // ── Custom field row ────────────────────────────────────────────────
          const { field } = row;
          const isActive = localActive[field.id] ?? field.active;

          if (editingId === field.id) {
            return (
              <div key={field.id} className="p-0">
                <FieldForm field={field} onDone={() => setEditingId(null)} />
              </div>
            );
          }

          return (
            <div
              key={field.id}
              draggable
              onDragStart={(e) => onDragStart(e, idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDragLeave={() => setOverIdx(null)}
              onDrop={(e) => onDrop(e, idx)}
              onDragEnd={onDragEnd}
              className={`flex items-center gap-3 px-3 py-3 transition-colors ${
                isOver ? "bg-muted/40" : "bg-background"
              } ${dragging ? "opacity-40" : ""} ${!isActive ? "opacity-60" : ""}`}
            >
              <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                <GripIcon />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-sm truncate ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {field.label}
                  </span>
                  <span className="text-xs border border-border rounded px-1.5 py-0.5 text-muted-foreground shrink-0 leading-none">
                    {TYPE_BADGE[field.type] ?? field.type}
                  </span>
                  {field.required && (
                    <span className="text-xs text-muted-foreground/60 shrink-0">
                      Required
                    </span>
                  )}
                </div>
              </div>

              <Toggle
                checked={isActive}
                onChange={(v) => updateFieldActive(field.id, v)}
              />

              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setEditingId(field.id)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                Edit
              </button>

              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (
                    confirm(`Remove "${field.label}"? This cannot be undone.`)
                  ) {
                    removeField(field.id);
                  }
                }}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {/* Add custom field */}
      {addMode ? (
        <div className="mt-2">
          <FieldForm onDone={() => setAddMode(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddMode(true)}
          className="mt-3 w-full rounded-md border-2 border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
        >
          + Add custom field
        </button>
      )}
    </div>
  );
}
