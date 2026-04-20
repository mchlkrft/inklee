"use client";

import { useState, useTransition } from "react";
import { saveFormSettingsAction } from "./form-settings-actions";
import type { FormSettings } from "@/lib/form-settings";

const FIXED_FIELDS = [
  { label: "instagram handle", note: "required" },
  { label: "email", note: "required" },
  { label: "placement", note: "required" },
  { label: "size", note: "required" },
  { label: "preferred date / slot", note: "required" },
];

const CONFIGURABLE: {
  key: keyof FormSettings;
  label: string;
  description: string;
}[] = [
  {
    key: "show_reference_link",
    label: "reference link",
    description: "optional url field for inspo or reference images online",
  },
  {
    key: "show_image_upload",
    label: "reference images",
    description: "lets customers upload up to 5 photos",
  },
  {
    key: "require_description",
    label: "description required",
    description: "when off, description becomes optional",
  },
];

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

export default function StandardFields({
  settings,
}: {
  settings: FormSettings;
}) {
  const [local, setLocal] = useState<FormSettings>({ ...settings });
  const [, startTransition] = useTransition();

  function update(key: keyof FormSettings, value: boolean) {
    setLocal((prev) => ({ ...prev, [key]: value }));
    startTransition(async () => {
      await saveFormSettingsAction(key, value);
    });
  }

  return (
    <div className="space-y-4">
      {/* Fixed fields — always on */}
      <div className="rounded-md border border-border divide-y divide-border">
        {FIXED_FIELDS.map((f) => (
          <div key={f.label} className="flex items-center px-4 py-3 gap-3">
            <span className="flex-1 text-sm text-muted-foreground">
              {f.label}
            </span>
            <span className="text-xs text-muted-foreground">{f.note}</span>
            <div className="w-9 flex justify-center">
              <span className="text-xs text-muted-foreground/40">—</span>
            </div>
          </div>
        ))}
      </div>

      {/* Configurable standard fields */}
      <div className="rounded-md border border-border divide-y divide-border">
        {CONFIGURABLE.map(({ key, label, description }) => (
          <div key={key} className="flex items-center px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            </div>
            <Toggle checked={local[key]} onChange={(v) => update(key, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}
