"use client";

import { useState, useTransition } from "react";
import { importPostsAsFlashItemsAction } from "./actions";

type Post = {
  id: string;
  media_type: string;
  preview_url: string | null;
  permalink: string;
  caption: string | null;
  already_linked: boolean;
};

export default function PostsBrowser({ posts }: { posts: Post[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{
    error?: string;
    created?: number;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleImport() {
    setResult(null);
    startTransition(async () => {
      const ids = [...selected].filter((id) => {
        const p = posts.find((p) => p.id === id);
        return p && !p.already_linked;
      });
      const res = await importPostsAsFlashItemsAction(ids);
      setResult(res);
      if (res.created) setSelected(new Set());
    });
  }

  const selectableCount = posts.filter((p) => !p.already_linked).length;
  const selectedCount = [...selected].filter((id) => {
    const p = posts.find((p) => p.id === id);
    return p && !p.already_linked;
  }).length;

  if (!posts.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No posts synced yet. Use Resync to fetch your latest Instagram posts.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {selectableCount > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} selected`
              : "Select posts to import as draft flash items"}
          </p>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0 || pending}
            className="rounded-md bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-40 transition-opacity"
          >
            {pending
              ? "Importing…"
              : `Add to Flash${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
          </button>
        </div>
      )}

      {result && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            result.error
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-500"
          }`}
        >
          {result.error ??
            `${result.created} item${result.created === 1 ? "" : "s"} created as drafts — edit them in Flash Items.`}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {posts.map((post) => {
          const previewUrl = post.preview_url;
          const isSelected = selected.has(post.id);
          const caption = post.caption?.slice(0, 80) ?? "";

          return (
            <div
              key={post.id}
              onClick={() => !post.already_linked && toggle(post.id)}
              className={`relative rounded-md overflow-hidden border-2 transition-colors ${
                post.already_linked
                  ? "border-border opacity-50 cursor-default"
                  : isSelected
                    ? "border-foreground cursor-pointer"
                    : "border-border hover:border-foreground/40 cursor-pointer"
              }`}
            >
              <div className="aspect-square bg-muted">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                    {post.media_type}
                  </div>
                )}
              </div>

              <div className="absolute top-2 right-2">
                {post.already_linked ? (
                  <span className="rounded-full bg-foreground/80 px-2 py-0.5 text-xs text-background font-medium leading-tight">
                    Added
                  </span>
                ) : (
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                      isSelected
                        ? "border-brand-mustard bg-brand-mustard text-brand-charcoal"
                        : "border-white/80 bg-black/25 text-white"
                    }`}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                )}
              </div>

              <div className="px-2 py-2 space-y-1">
                {caption && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                    {caption}
                  </p>
                )}
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View on Instagram ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
