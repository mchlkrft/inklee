"use client";

import { useActionState, useState } from "react";
import {
  APPEARANCE_THEMES,
  PAGE_TEMPLATES,
  PAGE_TEMPLATE_META,
  APPEARANCE_FONTS,
  BUTTON_TREATMENTS,
  BUTTON_RADII,
  fontStackFor,
  type AppearanceSettings,
  type AppearanceTheme,
  type PageTemplate,
  type AppearanceFontId,
  type ButtonTreatment,
  type ButtonRadius,
} from "@inklee/shared/appearance";
import { COVER_COLORS } from "@inklee/shared/cover-colors";
import { saveAppearanceAction } from "./actions";

const THEME_LABELS: Record<AppearanceTheme, string> = {
  light: "Light",
  dark: "Dark",
  auto: "Match the visitor",
};

const TREATMENT_LABELS: Record<ButtonTreatment, string> = {
  solid: "Solid",
  outline: "Outline",
  soft: "Soft",
};

const RADIUS_LABELS: Record<ButtonRadius, string> = {
  sharp: "Sharp",
  soft: "Soft",
  round: "Round",
};

function Choice({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`rounded-md border-2 px-4 py-2.5 text-sm transition-colors ${
        active
          ? "border-foreground bg-foreground/5 font-medium text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40"
      }`}
    >
      {children}
    </button>
  );
}

export default function AppearanceForm({
  appearance,
  entitled,
}: {
  appearance: AppearanceSettings;
  entitled: boolean;
}) {
  const [state, action, pending] = useActionState(saveAppearanceAction, null);
  const g = appearance.global;

  const [theme, setTheme] = useState<AppearanceTheme>(g.theme);
  const [template, setTemplate] = useState<PageTemplate>(g.template);
  const [accent, setAccent] = useState<string | null>(g.accent);
  const [font, setFont] = useState<AppearanceFontId>(g.font);
  const [treatment, setTreatment] = useState<ButtonTreatment>(
    g.buttonTreatment,
  );
  const [radius, setRadius] = useState<ButtonRadius>(g.buttonRadius);

  return (
    <form action={action} className="space-y-8">
      {!entitled && (
        <div className="rounded-2xl border border-border p-4">
          <p className="text-sm text-foreground">
            Custom appearance is part of Plus. Your current colour and cover
            image stay exactly as they are.
          </p>
        </div>
      )}

      {/* Hidden inputs carry the controlled values; the visible controls are
          buttons so a keyboard user gets one tab stop per option group. */}
      <input type="hidden" name="theme" value={theme} />
      <input type="hidden" name="template" value={template} />
      <input type="hidden" name="accent" value={accent ?? ""} />
      <input type="hidden" name="font" value={font} />
      <input type="hidden" name="buttonTreatment" value={treatment} />
      <input type="hidden" name="buttonRadius" value={radius} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">
          Layout
        </legend>
        <p className="text-xs text-muted-foreground">
          Applies to your Inklee page and your booking form.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAGE_TEMPLATES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTemplate(id)}
              aria-pressed={template === id}
              className={`rounded-md border-2 px-4 py-3 text-left transition-colors ${
                template === id
                  ? "border-foreground bg-foreground/5"
                  : "border-border hover:border-foreground/40"
              }`}
            >
              <span className="block text-sm font-medium text-foreground">
                {PAGE_TEMPLATE_META[id].label}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {PAGE_TEMPLATE_META[id].description}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">Theme</legend>
        <div className="flex flex-wrap gap-2">
          {APPEARANCE_THEMES.map((t) => (
            <Choice key={t} active={theme === t} onSelect={() => setTheme(t)}>
              {THEME_LABELS[t]}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">
          Accent colour
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          <Choice active={accent === null} onSelect={() => setAccent(null)}>
            None
          </Choice>
          {COVER_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setAccent(c.id)}
              aria-label={c.label}
              aria-pressed={accent === c.id}
              className={`h-10 w-10 rounded-full border-2 transition-transform ${
                accent === c.id
                  ? "border-foreground scale-110"
                  : "border-border hover:scale-105"
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">
          Typography
        </legend>
        <div className="flex flex-wrap gap-2">
          {APPEARANCE_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFont(f.id)}
              aria-pressed={font === f.id}
              style={{ fontFamily: fontStackFor(f.id) }}
              className={`rounded-md border-2 px-4 py-2.5 text-sm transition-colors ${
                font === f.id
                  ? "border-foreground bg-foreground/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">
          Buttons
        </legend>
        <div className="flex flex-wrap gap-2">
          {BUTTON_TREATMENTS.map((t) => (
            <Choice
              key={t}
              active={treatment === t}
              onSelect={() => setTreatment(t)}
            >
              {TREATMENT_LABELS[t]}
            </Choice>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {BUTTON_RADII.map((r) => (
            <Choice key={r} active={radius === r} onSelect={() => setRadius(r)}>
              {RADIUS_LABELS[r]}
            </Choice>
          ))}
        </div>
      </fieldset>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save appearance"}
      </button>
    </form>
  );
}
