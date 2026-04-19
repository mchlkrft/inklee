"use client";

import { useActionState, useEffect, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { checkSlugAvailability, claimSlugAction } from "./actions";

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
      return { text: "checking…", color: "text-muted-foreground" };
    if (!result) return null;
    if (result.error) return { text: result.error, color: "text-destructive" };
    if (result.available) return { text: "available", color: "text-green-500" };
    return { text: "already taken", color: "text-destructive" };
  })();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">inklee</h1>
          <p className="text-muted-foreground">claim your booking link</p>
        </div>

        <form action={action} className="space-y-6">
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="space-y-2">
            <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
              <span className="text-muted-foreground select-none">
                inklee.app/
              </span>
              <input
                name="slug"
                type="text"
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  )
                }
                placeholder="your-name"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            {hint && <p className={`text-xs ${hint.color}`}>{hint.text}</p>}
            <p className="text-xs text-muted-foreground">
              3–30 characters, lowercase letters and numbers, single dashes
            </p>
          </div>

          <button
            type="submit"
            disabled={pending || !canSubmit}
            className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "claiming…" : "claim slug"}
          </button>
        </form>
      </div>
    </div>
  );
}
