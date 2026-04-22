"use client";

import { useActionState, useState } from "react";
import { saveOnboardingProfileAction } from "./actions";
import OnboardingProgress from "@/components/onboarding-progress";
import Link from "next/link";

type State = { error: string } | null;

export default function OnboardingProfilePage() {
  const [state, action, pending] = useActionState<State, FormData>(
    saveOnboardingProfileAction,
    null,
  );
  const [bio, setBio] = useState("");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Your profile</h1>
        <p className="text-sm text-muted-foreground">
          This appears on your public booking page.
        </p>
      </div>

      <OnboardingProgress current={2} />

      <form action={action} className="space-y-5">
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="location" className="text-sm text-muted-foreground">
            Location
          </label>
          <input
            id="location"
            name="location"
            type="text"
            placeholder="City, e.g. Berlin"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="instagram_handle"
            className="text-sm text-muted-foreground"
          >
            Instagram handle
          </label>
          <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
            <span className="text-muted-foreground select-none">@</span>
            <input
              id="instagram_handle"
              name="instagram_handle"
              type="text"
              placeholder="yourhandle"
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <label htmlFor="bio" className="text-sm text-muted-foreground">
              Bio
            </label>
            <span
              className={`text-xs ${bio.length > 280 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {bio.length}/280
            </span>
          </div>
          <textarea
            id="bio"
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="A short intro for your clients"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Saving…" : "Continue →"}
          </button>
          <Link
            href="/onboarding/booking"
            className="rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </Link>
        </div>
      </form>
    </div>
  );
}
