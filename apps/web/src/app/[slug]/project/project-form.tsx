"use client";

import { useActionState, useState } from "react";
import Spinner from "@/components/spinner";
import {
  BODY_AREAS,
  COVERAGE_LEVELS,
  PROJECT_SCALES,
  SESSION_COMMITMENTS,
  CONSULTATION_METHODS,
  PROJECT_TITLE_MAX,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_GOAL_MAX,
  PROJECT_MAX_BODY_AREAS,
  PROJECT_MAX_STYLES,
  PROJECT_MAX_IMAGES,
  PROJECT_MAX_IMAGE_BYTES,
  PROJECT_MAX_TOTAL_BYTES,
} from "@inklee/shared/projects";
import { STYLE_SEED } from "@inklee/shared/map-directory";
import { submitProjectIntakeAction } from "./actions";

type State = { error: string; field?: string } | null;

const FIELD =
  "w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function Chips({
  name,
  options,
  selected,
  onToggle,
  max,
}: {
  name: string;
  options: readonly { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
  max: number;
}) {
  return (
    <>
      {selected.map((k) => (
        <input key={k} type="hidden" name={name} value={k} />
      ))}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = selected.includes(o.key);
          // A full selection greys the rest rather than silently ignoring a
          // tap: an unresponsive chip reads as broken.
          const blocked = !active && selected.length >= max;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => !blocked && onToggle(o.key)}
              aria-pressed={active}
              disabled={blocked}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-foreground bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/40"
              } ${blocked ? "opacity-40" : ""}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

export default function ProjectForm({
  slug,
  artistFirstName,
}: {
  slug: string;
  artistFirstName: string;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    submitProjectIntakeAction,
    null,
  );

  const [bodyAreas, setBodyAreas] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const err = (field: string) =>
    state?.field === field ? state.error : undefined;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="slug" value={slug} />

      {state?.error && !state.field && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm text-muted-foreground">
          Give it a name *
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={PROJECT_TITLE_MAX}
          placeholder="e.g. Japanese back piece"
          className={FIELD}
        />
        {err("title") && (
          <p className="text-xs text-destructive">{err("title")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm text-muted-foreground">
          What do you have in mind? *
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          maxLength={PROJECT_DESCRIPTION_MAX}
          placeholder="Subject, mood, anything you already know you want or want to avoid."
          className={FIELD}
        />
        {err("description") && (
          <p className="text-xs text-destructive">{err("description")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="longTermGoal" className="text-sm text-muted-foreground">
          Where is this going long term?{" "}
          <span className="text-xs">(optional)</span>
        </label>
        <textarea
          id="longTermGoal"
          name="longTermGoal"
          rows={3}
          maxLength={PROJECT_GOAL_MAX}
          placeholder="e.g. eventually a full bodysuit, starting with the back."
          className={FIELD}
        />
      </div>

      <div className="space-y-2">
        <span className="text-sm text-muted-foreground">
          Which areas? *{" "}
          <span className="text-xs">(up to {PROJECT_MAX_BODY_AREAS})</span>
        </span>
        <Chips
          name="bodyAreas"
          options={BODY_AREAS}
          selected={bodyAreas}
          onToggle={(k) => toggle(bodyAreas, setBodyAreas, k)}
          max={PROJECT_MAX_BODY_AREAS}
        />
        {err("bodyAreas") && (
          <p className="text-xs text-destructive">{err("bodyAreas")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="coverage" className="text-sm text-muted-foreground">
          What is there already? <span className="text-xs">(optional)</span>
        </label>
        <select id="coverage" name="coverage" className={FIELD}>
          <option value="">Prefer not to say</option>
          {COVERAGE_LEVELS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="availableAreas"
          className="text-sm text-muted-foreground"
        >
          Anything still free to work with?{" "}
          <span className="text-xs">(optional)</span>
        </label>
        <textarea
          id="availableAreas"
          name="availableAreas"
          rows={2}
          maxLength={PROJECT_GOAL_MAX}
          className={FIELD}
        />
      </div>

      <div className="space-y-2">
        <span className="text-sm text-muted-foreground">
          Styles you are drawn to{" "}
          <span className="text-xs">
            (optional, up to {PROJECT_MAX_STYLES})
          </span>
        </span>
        <Chips
          name="styles"
          options={STYLE_SEED}
          selected={styles}
          onToggle={(k) => toggle(styles, setStyles, k)}
          max={PROJECT_MAX_STYLES}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="scale" className="text-sm text-muted-foreground">
          How big is it? *
        </label>
        <select id="scale" name="scale" required className={FIELD}>
          <option value="">Choose one</option>
          {PROJECT_SCALES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        {err("scale") && (
          <p className="text-xs text-destructive">{err("scale")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="sessionCommitment"
          className="text-sm text-muted-foreground"
        >
          How many sessions can you commit to?{" "}
          <span className="text-xs">(optional)</span>
        </label>
        <select
          id="sessionCommitment"
          name="sessionCommitment"
          className={FIELD}
        >
          <option value="">Prefer not to say</option>
          {SESSION_COMMITMENTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="travelAvailability"
          className="text-sm text-muted-foreground"
        >
          Can you travel? <span className="text-xs">(optional)</span>
        </label>
        <input
          id="travelAvailability"
          name="travelAvailability"
          maxLength={PROJECT_GOAL_MAX}
          placeholder="e.g. anywhere in Europe with notice"
          className={FIELD}
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm text-muted-foreground">
          Budget range <span className="text-xs">(optional)</span>
        </span>
        <div className="flex items-center gap-2">
          <input
            name="budgetMin"
            type="number"
            min={0}
            step={50}
            placeholder="From"
            className={FIELD}
            aria-label="Budget from"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            name="budgetMax"
            type="number"
            min={0}
            step={50}
            placeholder="To"
            className={FIELD}
            aria-label="Budget to"
          />
        </div>
        {err("budgetMaxCents") && (
          <p className="text-xs text-destructive">{err("budgetMaxCents")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="consultationMethod"
          className="text-sm text-muted-foreground"
        >
          How would you rather talk it through?{" "}
          <span className="text-xs">(optional)</span>
        </label>
        <select
          id="consultationMethod"
          name="consultationMethod"
          className={FIELD}
        >
          <option value="">No preference</option>
          {CONSULTATION_METHODS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="images" className="text-sm text-muted-foreground">
          Photos{" "}
          <span className="text-xs">
            (optional, up to {PROJECT_MAX_IMAGES})
          </span>
        </label>
        <input
          id="images"
          name="images"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            // Checked here, not only on the server: a visitor who has just
            // filled in a long intake should learn a photo is too big while
            // they can still swap it, not after a slow upload fails.
            const files = Array.from(e.target.files ?? []);
            setImageCount(files.length);
            const tooBig = files.find((f) => f.size > PROJECT_MAX_IMAGE_BYTES);
            const total = files.reduce((n, f) => n + f.size, 0);
            if (tooBig) {
              setImageError(
                `"${tooBig.name}" is over ${Math.round(PROJECT_MAX_IMAGE_BYTES / 1024 / 1024)} MB. Pick a smaller version.`,
              );
            } else if (total > PROJECT_MAX_TOTAL_BYTES) {
              setImageError(
                `Those photos add up to more than ${Math.round(PROJECT_MAX_TOTAL_BYTES / 1024 / 1024)} MB. Send fewer, or smaller ones.`,
              );
            } else {
              setImageError(null);
            }
          }}
          className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-foreground/10 file:px-4 file:py-2 file:text-sm file:text-foreground"
        />
        {imageError ? (
          <p className="text-xs text-destructive" role="alert">
            {imageError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Photos of the area and of any tattoos already there help{" "}
            {artistFirstName} plan properly.
            {imageCount > PROJECT_MAX_IMAGES &&
              ` Only the first ${PROJECT_MAX_IMAGES} will be sent.`}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="customerEmail"
          className="text-sm text-muted-foreground"
        >
          Your email *
        </label>
        <input
          id="customerEmail"
          name="customerEmail"
          type="email"
          required
          className={FIELD}
        />
        {err("customerEmail") && (
          <p className="text-xs text-destructive">{err("customerEmail")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="customerHandle"
          className="text-sm text-muted-foreground"
        >
          Instagram <span className="text-xs">(optional)</span>
        </label>
        <input
          id="customerHandle"
          name="customerHandle"
          maxLength={100}
          placeholder="@yourhandle"
          className={FIELD}
        />
      </div>

      <button
        type="submit"
        disabled={pending || !!imageError}
        className="w-full rounded-full bg-brand-mustard px-6 py-3 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Send enquiry"}
      </button>
    </form>
  );
}
