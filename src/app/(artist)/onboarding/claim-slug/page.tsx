"use client";

import { useActionState, useEffect, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { checkSlugAvailability, claimSlugAction } from "./actions";
import OnboardingProgress from "@/components/onboarding-progress";

type State = { error: string } | null;
type AvailResult = { slug: string; available: boolean; error: string | null };

export default function ClaimSlugPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    claimSlugAction,
    null,
  );
  const [slug, setSlug] = useState("");
  const [result, setResult] = useState<AvailResult | null>(null);

  const debouncedSlug = useDebounce(slug, 300);

  useEffect(() => {
    if (!debouncedSlug || debouncedSlug.length < 3) return;
    let cancelled = false;
    checkSlugAvailability(debouncedSlug).then((r) => {
      if (!cancelled) setResult({ slug: debouncedSlug, ...r });
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSlug]);

  const isFresh = result?.slug === slug && slug === debouncedSlug;
  const isChecking = slug.length >= 3 && (!isFresh || slug !== debouncedSlug);
  const canSubmit = isFresh && result?.available === true;

  const hint = (() => {
    if (slug.length < 3) return null;
    if (isChecking)
      return { text: "Checking…", color: "text-muted-foreground" };
    if (!result) return null;
    if (result.error) return { text: result.error, color: "text-destructive" };
    if (result.available) return { text: "Available", color: "text-green-500" };
    return { text: "Already taken", color: "text-destructive" };
  })();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          Welcome to Inklee
        </h1>
        <p className="text-sm text-muted-foreground">
          Let&apos;s get your booking page set up.
        </p>
      </div>

      <OnboardingProgress current={1} />

      <form action={action} className="space-y-5">
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="space-y-1.5">
          <label className="text-sm text-muted-foreground">
            Your booking link <span className="text-foreground">*</span>
          </label>
          <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
            <span className="text-muted-foreground select-none">
              inklee.app/
            </span>
            <input
              name="slug"
              type="text"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              placeholder="your-name"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          {hint && <p className={`text-xs ${hint.color}`}>{hint.text}</p>}
          <p className="text-xs text-muted-foreground">
            3–30 characters, lowercase, single dashes — this is your permanent
            booking URL
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="first_name"
              className="text-sm text-muted-foreground"
            >
              First name
            </label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              placeholder="Bert"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="last_name"
              className="text-sm text-muted-foreground"
            >
              Last name
            </label>
            <input
              id="last_name"
              name="last_name"
              type="text"
              placeholder="Grimm"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="display_name"
            className="text-sm text-muted-foreground"
          >
            Artist name <span className="text-foreground">*</span>
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            placeholder="Shown on your public booking page"
            required
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={pending || !canSubmit}
          className="w-full rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : "Continue →"}
        </button>
      </form>
    </div>
  );
}
