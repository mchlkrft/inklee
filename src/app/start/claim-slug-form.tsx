"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/** Linktr.ee-style claim-your-slug field for the /start hero.
 *
 *  The user types a slug here; we stash it in localStorage and navigate
 *  to /signup. Later in the onboarding flow the claim-slug step reads
 *  this localStorage value and pre-fills the slug input so the artist
 *  doesn't have to retype it.
 *
 *  Sanitisation matches the claim-slug onboarding input exactly:
 *  lowercase letters / digits / dashes only. Final validation
 *  (3-30 chars, start with a letter, not reserved) happens in the
 *  onboarding step — this landing input just funnels the value through. */

const STORAGE_KEY = "inklee_intended_slug";

export default function ClaimSlugForm() {
  const router = useRouter();
  const [slug, setSlug] = useState("");

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Drop anything that won't make it into the final slug. Visual feedback
    // is immediate — the user can't even type a forbidden character.
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (slug) {
      try {
        localStorage.setItem(STORAGE_KEY, slug);
      } catch {
        // Storage unavailable (private mode, etc) — silently degrade.
        // The signup flow still works, the artist will just type the
        // slug at the claim-slug step.
      }
    }
    router.push("/signup");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-8 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-stretch"
    >
      <label className="sr-only" htmlFor="hero-slug">
        Choose your inkl.ee handle
      </label>
      <div className="flex flex-1 items-center rounded-full bg-brand-bone px-5 py-3.5 text-base shadow-card transition-shadow focus-within:shadow-shell">
        <span className="select-none font-bold text-brand-charcoal/55">
          inkl.ee/
        </span>
        <input
          id="hero-slug"
          name="slug"
          type="text"
          value={slug}
          onChange={onChange}
          placeholder="yourname"
          autoComplete="off"
          spellCheck={false}
          maxLength={30}
          className="ml-0.5 min-w-0 flex-1 bg-transparent font-bold text-brand-charcoal placeholder:font-medium placeholder:text-brand-charcoal/35 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-mustard px-8 py-3.5 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
      >
        Get started for free
      </button>
    </form>
  );
}
