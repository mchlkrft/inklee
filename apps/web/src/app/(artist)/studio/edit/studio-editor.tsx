"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SelectInput from "@/components/select-input";
import {
  ADDRESS_VISIBILITY_LABELS,
  GUEST_SPOT_STATUS_LABELS,
  MIN_STUDIO_CATEGORIES,
  STUDIO_STANDARD_CATEGORY_LABELS,
  STUDIO_STANDARD_CATEGORIES,
  validateCustomCategory,
  type AddressVisibility,
  type GuestSpotStatus,
  type StudioStandardCategory,
} from "@inklee/shared/studio-profile";
import {
  setStudioCategoriesAction,
  updateStudioProfileAction,
} from "../actions";
import type { OwnedStudio } from "@/lib/server/studios";
import type { StudioCategoryInput } from "@/lib/server/studios";

const VISIBILITY_OPTIONS = (
  Object.entries(ADDRESS_VISIBILITY_LABELS) as Array<
    [AddressVisibility, string]
  >
).map(([value, label]) => ({ value, label }));

const GUEST_OPTIONS = (
  Object.entries(GUEST_SPOT_STATUS_LABELS) as Array<[GuestSpotStatus, string]>
).map(([value, label]) => ({ value, label }));

export default function StudioEditor({
  studio,
  styles,
}: {
  studio: OwnedStudio;
  styles: Array<{ key: string; label: string }>;
}) {
  const router = useRouter();

  // Profile section state.
  const [name, setName] = useState(studio.name);
  const [description, setDescription] = useState(studio.description ?? "");
  const [vibe, setVibe] = useState(studio.vibe ?? "");
  const [addressVisibility, setAddressVisibility] = useState(
    studio.addressVisibility,
  );
  const [guestSpotStatus, setGuestSpotStatus] = useState(
    studio.guestSpotStatus,
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profilePending, startProfile] = useTransition();

  // Category section state, seeded from the current rows.
  const [styleKeys, setStyleKeys] = useState<Set<string>>(
    () =>
      new Set(
        studio.categories
          .filter((c) => c.styleKey)
          .map((c) => c.styleKey as string),
      ),
  );
  const [standardKeys, setStandardKeys] = useState<Set<string>>(
    () =>
      new Set(
        studio.categories
          .filter((c) => c.standardKey)
          .map((c) => c.standardKey as string),
      ),
  );
  const [customLabels, setCustomLabels] = useState<string[]>(() =>
    studio.categories
      .filter((c) => c.customLabel)
      .map((c) => c.customLabel as string),
  );
  const [customDraft, setCustomDraft] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySaved, setCategorySaved] = useState(false);
  const [categoryPending, startCategory] = useTransition();

  const categoryCount =
    styleKeys.size + standardKeys.size + customLabels.length;

  const toggleSet = (
    set: Set<string>,
    setter: (s: Set<string>) => void,
    key: string,
  ) => {
    setCategorySaved(false);
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const addCustom = () => {
    const bad = validateCustomCategory(customDraft);
    if (bad) {
      setCategoryError(bad);
      return;
    }
    const label = customDraft.trim();
    if (customLabels.some((l) => l.toLowerCase() === label.toLowerCase())) {
      setCategoryError("You already added that category.");
      return;
    }
    setCategorySaved(false);
    setCategoryError(null);
    setCustomLabels([...customLabels, label]);
    setCustomDraft("");
  };

  const saveProfile = () => {
    setProfileError(null);
    setProfileSaved(false);
    startProfile(async () => {
      const result = await updateStudioProfileAction(studio.id, {
        name,
        description,
        vibe,
        address: studio.address,
        city: studio.city,
        country: studio.country,
        postalCode: studio.postalCode,
        addressVisibility,
        guestSpotStatus,
      });
      if (result.error) {
        setProfileError(result.error);
        return;
      }
      setProfileSaved(true);
      router.refresh();
    });
  };

  const saveCategories = () => {
    setCategoryError(null);
    setCategorySaved(false);
    const categories: StudioCategoryInput[] = [
      ...[...styleKeys].map((key) => ({ kind: "style" as const, key })),
      ...[...standardKeys].map((key) => ({ kind: "standard" as const, key })),
      ...customLabels.map((label) => ({ kind: "custom" as const, label })),
    ];
    startCategory(async () => {
      const result = await setStudioCategoriesAction(studio.id, categories);
      if (result.error) {
        setCategoryError(result.error);
        return;
      }
      setCategorySaved(true);
      router.refresh();
    });
  };

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const label = "text-xs text-muted-foreground";
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
      active
        ? "bg-foreground text-background"
        : "bg-muted text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-8">
      {/* Profile */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Details</h2>
        <div className="space-y-1">
          <label className={label} htmlFor="studio-name">
            Name
          </label>
          <input
            id="studio-name"
            className={field}
            value={name}
            onChange={(e) => {
              setProfileSaved(false);
              setName(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="studio-description">
            Description
          </label>
          <textarea
            id="studio-description"
            className={`${field} min-h-24`}
            value={description}
            onChange={(e) => {
              setProfileSaved(false);
              setDescription(e.target.value);
            }}
            placeholder="What is your studio like to work at?"
          />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="studio-vibe">
            Vibe
          </label>
          <textarea
            id="studio-vibe"
            className={`${field} min-h-16`}
            value={vibe}
            onChange={(e) => {
              setProfileSaved(false);
              setVibe(e.target.value);
            }}
            placeholder="Music, coffee, the feel of the place."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <span className={label}>Address shows as</span>
            <SelectInput
              options={VISIBILITY_OPTIONS}
              value={addressVisibility}
              onChange={(e) => {
                setProfileSaved(false);
                setAddressVisibility(e.target.value);
              }}
              ariaLabel="Address shows as"
            />
          </div>
          <div className="space-y-1">
            <span className={label}>Guest spots</span>
            <SelectInput
              options={GUEST_OPTIONS}
              value={guestSpotStatus}
              onChange={(e) => {
                setProfileSaved(false);
                setGuestSpotStatus(e.target.value);
              }}
              ariaLabel="Guest spots"
            />
          </div>
        </div>
        {profileError ? (
          <p className="text-sm text-brand-red">{profileError}</p>
        ) : null}
        {profileSaved ? (
          <p className="text-sm text-muted-foreground">Saved.</p>
        ) : null}
        <button
          type="button"
          disabled={profilePending}
          onClick={saveProfile}
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {profilePending ? "Saving..." : "Save details"}
        </button>
      </section>

      {/* Categories */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Categories</h2>
          <span
            className={`text-xs ${
              categoryCount >= MIN_STUDIO_CATEGORIES
                ? "text-muted-foreground"
                : "text-brand-mustard"
            }`}
          >
            {categoryCount} chosen (need {MIN_STUDIO_CATEGORIES})
          </span>
        </div>

        <div className="space-y-1.5">
          <p className={label}>Styles</p>
          <div className="flex flex-wrap gap-1.5">
            {styles.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={styleKeys.has(s.key)}
                className={chip(styleKeys.has(s.key))}
                onClick={() => toggleSet(styleKeys, setStyleKeys, s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className={label}>Studio type</p>
          <div className="flex flex-wrap gap-1.5">
            {STUDIO_STANDARD_CATEGORIES.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={standardKeys.has(key)}
                className={chip(standardKeys.has(key))}
                onClick={() => toggleSet(standardKeys, setStandardKeys, key)}
              >
                {STUDIO_STANDARD_CATEGORY_LABELS[key as StudioStandardCategory]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className={label}>Custom</p>
          <div className="flex flex-wrap gap-1.5">
            {customLabels.map((l) => (
              <button
                key={l}
                type="button"
                className={chip(true)}
                onClick={() => {
                  setCategorySaved(false);
                  setCustomLabels(customLabels.filter((x) => x !== l));
                }}
              >
                {l} ✕
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={field}
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Add your own (e.g. left-handed friendly)"
            />
            <button
              type="button"
              onClick={addCustom}
              className="shrink-0 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
            >
              Add
            </button>
          </div>
        </div>

        {categoryError ? (
          <p className="text-sm text-brand-red">{categoryError}</p>
        ) : null}
        {categorySaved ? (
          <p className="text-sm text-muted-foreground">Saved.</p>
        ) : null}
        <button
          type="button"
          disabled={categoryPending}
          onClick={saveCategories}
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {categoryPending ? "Saving..." : "Save categories"}
        </button>
      </section>
    </div>
  );
}
