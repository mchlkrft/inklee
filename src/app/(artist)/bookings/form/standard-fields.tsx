"use client";

import { useState, useTransition } from "react";
import { saveFormSettingsAction } from "./form-settings-actions";
import type { FormSettings } from "@/lib/form-settings";

const FIELDS: {
  key: keyof FormSettings;
  label: string;
  description: string;
}[] = [
  {
    key: "show_instagram_handle",
    label: "instagram handle",
    description: "recommended contact method for booking coordination",
  },
  {
    key: "show_email",
    label: "email",
    description: "used to send booking confirmation and updates",
  },
  {
    key: "show_placement",
    label: "placement",
    description: "where on the body the client wants the tattoo",
  },
  {
    key: "show_size",
    label: "size",
    description: "approximate size selection (palm-sized to larger)",
  },
  {
    key: "show_preferred_date",
    label: "preferred date / slot",
    description:
      "required booking selection field used for preferred dates or fixed slots",
  },
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
    key: "allow_photo_annotations",
    label: "photo annotations",
    description:
      "after uploading a photo, clients can tap to mark spots with notes",
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
    <div className="rounded-md border border-border divide-y divide-border">
      {FIELDS.map(({ key, label, description }) => (
        <div key={key} className="flex items-center px-4 py-3 gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
            </p>
          </div>
          {key === "show_preferred_date" ? (
            <span className="text-xs text-muted-foreground">Always on</span>
          ) : (
            <Toggle checked={local[key]} onChange={(v) => update(key, v)} />
          )}
        </div>
      ))}
    </div>
  );
}
