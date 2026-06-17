"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  createFolderAction,
  renameFolderAction,
  deleteFolderAction,
} from "./folder-actions";

export type FolderChip = { id: string; name: string; count: number };

// Folder filter rail above the Designs grid: All / Unfiled / each folder (with
// counts), plus create + rename/delete of the active folder. Filtering is via
// the ?folder= query param (server reads it); mutations call the shared folder
// actions and navigate/refresh.
export default function FlashFolderRail({
  folders,
  active,
  allCount,
  unfiledCount,
}: {
  folders: FolderChip[];
  active: string; // "all" | "unfiled" | folderId
  allCount: number;
  unfiledCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const activeFolder = folders.find((f) => f.id === active) ?? null;

  function newFolder() {
    const name = window.prompt("Folder name")?.trim();
    if (!name) return;
    startTransition(async () => {
      setError(null);
      const r = await createFolderAction(name);
      if ("error" in r) setError(r.error);
      else router.push(`/flash/items?folder=${r.id}`);
    });
  }

  function rename() {
    if (!activeFolder) return;
    const name = window.prompt("Rename folder", activeFolder.name)?.trim();
    if (!name || name === activeFolder.name) return;
    startTransition(async () => {
      setError(null);
      const r = await renameFolderAction(activeFolder.id, name);
      if ("error" in r) setError(r.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!activeFolder) return;
    if (
      !window.confirm(
        `Delete "${activeFolder.name}"? Designs in it become Unfiled.`,
      )
    )
      return;
    startTransition(async () => {
      setError(null);
      const r = await deleteFolderAction(activeFolder.id);
      if ("error" in r) setError(r.error);
      else router.push("/flash/items");
    });
  }

  const chip = (label: string, count: number, href: string, on: boolean) => (
    <Link
      key={href}
      href={href}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        on
          ? "border-brand-mustard bg-brand-mustard text-brand-charcoal"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      }`}
    >
      {label}
      <span
        className={on ? "text-brand-charcoal/70" : "text-muted-foreground/60"}
      >
        {" "}
        {count}
      </span>
    </Link>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {chip("All", allCount, "/flash/items", active === "all")}
        {chip(
          "Unfiled",
          unfiledCount,
          "/flash/items?folder=unfiled",
          active === "unfiled",
        )}
        {folders.map((f) =>
          chip(f.name, f.count, `/flash/items?folder=${f.id}`, active === f.id),
        )}
        <button
          type="button"
          onClick={newFolder}
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          New folder
        </button>
        {activeFolder && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={rename}
              disabled={pending}
              aria-label="Rename folder"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Delete folder"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
