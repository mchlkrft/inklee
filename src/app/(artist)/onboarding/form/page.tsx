"use client";

import { useActionState, useState } from "react";
import { saveOnboardingFormAction } from "./actions";
import OnboardingProgress from "@/components/onboarding-progress";
import Link from "next/link";
import { Image as ImageIcon, AlignLeft, Link2 } from "lucide-react";

type State = { error: string } | null;

type ToggleField = {
  key: "show_image_upload" | "require_description" | "show_reference_link";
  icon: typeof ImageIcon;
  title: string;
  desc: string;
  defaultOn: boolean;
};

const FIELDS: ToggleField[] = [
  {
    key: "show_image_upload",
    icon: ImageIcon,
    title: "Reference image upload",
    desc: "Clients can attach reference photos with their request.",
    defaultOn: true,
  },
  {
    key: "require_description",
    icon: AlignLeft,
    title: "Require a description",
    desc: "Clients must describe their tattoo idea before submitting.",
    defaultOn: true,
  },
  {
    key: "show_reference_link",
    icon: Link2,
    title: "Reference link field",
    desc: "Clients can paste a link to inspiration (Pinterest, etc.).",
    defaultOn: true,
  },
];

export default function OnboardingFormPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    saveOnboardingFormAction,
    null,
  );
  const [values, setValues] = useState<Record<string, boolean>>({
    show_image_upload: true,
    require_description: true,
    show_reference_link: true,
  });

  function toggle(key: string) {
    setValues((v) => ({ ...v, [key]: !v[key] }));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Booking form</h1>
        <p className="text-sm text-muted-foreground">
          What should clients include in their request? These are your defaults
          — you can adjust them later in settings.
        </p>
      </div>

      <OnboardingProgress current={4} />

      <form action={action} className="space-y-5">
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        {/* Hidden fields for all values */}
        {FIELDS.map(({ key }) => (
          <input
            key={key}
            type="hidden"
            name={key}
            value={String(values[key])}
          />
        ))}

        <div className="space-y-2">
          {FIELDS.map(({ key, icon: Icon, title, desc }) => {
            const on = values[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                className={`flex w-full items-center gap-4 rounded-md border-2 p-4 text-left transition-colors ${
                  on
                    ? "border-foreground bg-muted/20"
                    : "border-border opacity-60"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${on ? "text-foreground" : "text-muted-foreground"}`}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${on ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {title}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {desc}
                  </p>
                </div>
                <div
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-foreground" : "bg-border"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Clients always provide: Instagram handle, tattoo placement, and
          preferred date. The fields above are additional.
        </p>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
          >
            {pending ? "Saving…" : "Looks good →"}
          </button>
          <Link
            href="/onboarding/done"
            className="rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </Link>
        </div>
      </form>
    </div>
  );
}
