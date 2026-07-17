"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  MAP_LOCATION_CATEGORY_LABELS,
  MAP_MODERATION_LABELS,
  type MapLocationCategory,
  type MapModerationStatus,
} from "@inklee/shared/map-directory";

export type DirectoryRow = {
  id: string;
  source: string;
  category: MapLocationCategory;
  name: string;
  city: string | null;
  country: string | null;
  claim_status: string;
  moderation_status: MapModerationStatus;
  is_seed: boolean;
  seed_region_bucket: string | null;
  created_at: string;
  updated_at: string;
};

const MODERATION_TINT: Record<MapModerationStatus, string> = {
  pending: "text-brand-mustard",
  approved: "text-foreground",
  hidden: "text-muted-foreground",
  removed: "text-brand-red",
};

type CategoryFilter = "all" | MapLocationCategory;
type ModerationFilter = "all" | MapModerationStatus;

export default function MapDirectoryClient({
  rows,
  limit,
}: {
  rows: DirectoryRow[];
  limit: number;
}) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [moderation, setModeration] = useState<ModerationFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (moderation !== "all" && r.moderation_status !== moderation)
        return false;
      if (
        q &&
        !`${r.name} ${r.city ?? ""} ${r.country ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [rows, category, moderation, search]);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
      active
        ? "bg-foreground text-background"
        : "bg-muted text-muted-foreground hover:text-foreground"
    }`;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or city"
          className="w-56 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Category filter"
        >
          <button
            type="button"
            className={chip(category === "all")}
            onClick={() => setCategory("all")}
          >
            All categories
          </button>
          {(
            Object.entries(MAP_LOCATION_CATEGORY_LABELS) as Array<
              [MapLocationCategory, string]
            >
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={chip(category === key)}
              onClick={() => setCategory(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Moderation filter"
        >
          <button
            type="button"
            className={chip(moderation === "all")}
            onClick={() => setModeration("all")}
          >
            Any status
          </button>
          {(
            Object.entries(MAP_MODERATION_LABELS) as Array<
              [MapModerationStatus, string]
            >
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={chip(moderation === key)}
              onClick={() => setModeration(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "The directory is empty. Add the first location to start curating a city."
            : "No entries match these filters."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal">Category</th>
                <th className="px-3 py-2 font-normal">City</th>
                <th className="px-3 py-2 font-normal">Status</th>
                <th className="px-3 py-2 font-normal">Claim</th>
                <th className="px-3 py-2 font-normal">Seed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/map/${r.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {MAP_LOCATION_CATEGORY_LABELS[r.category] ?? r.category}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {[r.city, r.country].filter(Boolean).join(", ")}
                  </td>
                  <td
                    className={`px-3 py-2 ${MODERATION_TINT[r.moderation_status] ?? ""}`}
                  >
                    {MAP_MODERATION_LABELS[r.moderation_status] ??
                      r.moderation_status}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.claim_status.replace("_", " ")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.is_seed ? (r.seed_region_bucket ?? "yes") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} loaded entries (newest{" "}
        {limit} by last update).
      </p>
    </section>
  );
}
