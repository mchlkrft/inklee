"use client";

import { useState, useTransition } from "react";
import {
  WELCOME_PACK_FIELDS,
  WELCOME_PACK_FIELD_LABELS,
  WELCOME_PACK_FIELD_MAX,
  type WelcomePackField,
  type WelcomePackInput,
} from "@inklee/shared/studio-profile";
import { setWelcomePackAction } from "../actions";

const INPUT_CLS =
  "w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const PLACEHOLDERS: Record<WelcomePackField, string> = {
  access_details: "Door code, which bell, where to park.",
  wifi: "Network name and password.",
  emergency_contact: "Who to call when something goes wrong.",
  supply_shops: "Where to get needles and ink nearby.",
  promotion_notes: "Tag us, story templates, what to post.",
  local_notes: "Food, coffee, what to see after work.",
};

export default function WelcomePackSection({
  studioId,
  initial,
}: {
  studioId: string;
  initial: WelcomePackInput;
}) {
  const [values, setValues] = useState<WelcomePackInput>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setField = (field: WelcomePackField, value: string) => {
    setSaved(false);
    setValues((v) => ({ ...v, [field]: value }));
  };

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setWelcomePackAction(studioId, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Welcome pack</h2>
        <p className="text-xs text-muted-foreground">
          What a confirmed guest artist needs on arrival. Only artists with a
          confirmed stay see this; it never shows on your public page.
        </p>
      </div>

      <ul className="space-y-3">
        {WELCOME_PACK_FIELDS.map((field) => (
          <li key={field} className="space-y-1">
            <label className="text-sm text-foreground" htmlFor={`wp-${field}`}>
              {WELCOME_PACK_FIELD_LABELS[field]}
            </label>
            <textarea
              id={`wp-${field}`}
              value={values[field] ?? ""}
              onChange={(e) => setField(field, e.target.value)}
              maxLength={WELCOME_PACK_FIELD_MAX}
              rows={2}
              placeholder={PLACEHOLDERS[field]}
              className={INPUT_CLS}
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Your house rules already show alongside the pack on the guest&apos;s
        request page.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save welcome pack"}
        </button>
        {saved ? (
          <span className="text-xs text-muted-foreground">Saved.</span>
        ) : null}
        {error ? <span className="text-xs text-brand-red">{error}</span> : null}
      </div>
    </section>
  );
}
