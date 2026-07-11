"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

const STAGE_OPTIONS = [
  { value: "", label: "All stages" },
  {
    value: "claimed_not_completed",
    label: "Claimed, onboarding not completed",
  },
  {
    value: "completed_no_requests",
    label: "Onboarding completed, no requests yet",
  },
  { value: "requests_no_approval", label: "Requests received, none approved" },
  { value: "activated", label: "Activated" },
  { value: "activated_inactive", label: "Activated, later inactive" },
];

const RETENTION_OPTIONS = [
  { value: "", label: "All retention states" },
  { value: "active", label: "Active" },
  { value: "churn_risk", label: "Churn risk" },
  { value: "dormant", label: "Dormant" },
  { value: "churned", label: "Churned" },
  { value: "pre_activation", label: "Pre-activation" },
];

const PLATFORM_OPTIONS = [
  { value: "", label: "All platforms" },
  { value: "mobile", label: "Mobile app" },
  { value: "web", label: "Web only" },
];

const FEATURE_OPTIONS = [
  { value: "", label: "Any feature" },
  { value: "slots", label: "Bookable slots" },
  { value: "flash", label: "Flash published" },
  { value: "guest_spots", label: "Guest spot published" },
  { value: "waitlist", label: "Waitlist entries" },
  { value: "deposits", label: "Deposit paid" },
  { value: "instagram", label: "Instagram connected" },
  { value: "custom_form", label: "Custom form fields" },
  { value: "email_templates", label: "Email templates" },
  { value: "mobile_app", label: "Mobile app" },
  { value: "support", label: "Contacted support" },
  { value: "books_open", label: "Books open" },
  { value: "lifecycle_emailed", label: "Lifecycle email received" },
];

/** URL params owned by this filter bar (range/from/to are left untouched so
 *  the cockpit-wide date selection survives filtering). */
const FILTER_KEYS = [
  "stage",
  "retention",
  "source",
  "platform",
  "feature",
  "search",
  "claimedFrom",
  "claimedTo",
  "testers",
] as const;

const inputClass =
  "rounded border border-border bg-background px-2 py-1 text-xs text-foreground";

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * User explorer filter bar. All state lives in the URL query (same pattern as
 * range-picker.tsx) so filtered views are shareable and pagination/export
 * links can reuse the exact query string. Any filter change resets ?page=.
 */
export default function FilterBar({
  sourceOptions,
}: {
  sourceOptions: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [claimedFrom, setClaimedFrom] = useState(
    searchParams.get("claimedFrom") ?? "",
  );
  const [claimedTo, setClaimedTo] = useState(
    searchParams.get("claimedTo") ?? "",
  );

  function apply(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("page"); // a changed filter always restarts at page 1
    const queryString = next.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function clearFilters() {
    setSearch("");
    setClaimedFrom("");
    setClaimedTo("");
    apply(Object.fromEntries(FILTER_KEYS.map((key) => [key, null] as const)));
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Stage"
          value={searchParams.get("stage") ?? ""}
          options={STAGE_OPTIONS}
          onChange={(value) => apply({ stage: value })}
        />
        <FilterSelect
          label="Retention"
          value={searchParams.get("retention") ?? ""}
          options={RETENTION_OPTIONS}
          onChange={(value) => apply({ retention: value })}
        />
        <FilterSelect
          label="Source"
          value={searchParams.get("source") ?? ""}
          options={[
            { value: "", label: "All sources" },
            ...sourceOptions.map((source) => ({
              value: source,
              label: source === "unknown" ? "Unknown" : source,
            })),
          ]}
          onChange={(value) => apply({ source: value })}
        />
        <FilterSelect
          label="Platform"
          value={searchParams.get("platform") ?? ""}
          options={PLATFORM_OPTIONS}
          onChange={(value) => apply({ platform: value })}
        />
        <FilterSelect
          label="Feature used"
          value={searchParams.get("feature") ?? ""}
          options={FEATURE_OPTIONS}
          onChange={(value) => apply({ feature: value })}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Search
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply({ search: search.trim() });
            }}
            placeholder="Name or slug, press Enter"
            className={`${inputClass} w-48`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Claimed from
          <input
            type="date"
            value={claimedFrom}
            onChange={(event) => {
              setClaimedFrom(event.target.value);
              apply({ claimedFrom: event.target.value });
            }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Claimed to
          <input
            type="date"
            value={claimedTo}
            onChange={(event) => {
              setClaimedTo(event.target.value);
              apply({ claimedTo: event.target.value });
            }}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={searchParams.get("testers") === "1"}
            onChange={(event) =>
              apply({ testers: event.target.checked ? "1" : null })
            }
            className="accent-foreground"
          />
          Include testers
        </label>
        <button
          onClick={clearFilters}
          className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
