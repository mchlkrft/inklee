"use client";

import { useActionState, useRef, useState } from "react";
import {
  MAX_INTRO_TEXT,
  MAX_FEATURED_COLLECTIONS,
  type SurfaceContent,
} from "@inklee/shared/surface-content";
import { saveShopContentAction, uploadShopHeroImageAction } from "./actions";

// Shop surface content editor (founder ruling FD10, 2026-08-01): hero image,
// intro line, and featured collections for the "shop" surface. Lives on the
// Goods page (not the Appearance settings page) because this is CONTENT
// about the shop specifically, gated on `rich_content_blocks`, distinct from
// the styling layer (`appearance_custom`) the Appearance page owns — see the
// FD10 implementation note in plus-build-time-decisions.md for the full
// storage/entitlement reasoning.
export default function ShopContentForm({
  content,
  entitled,
  collections,
}: {
  content: SurfaceContent;
  entitled: boolean;
  collections: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    saveShopContentAction,
    null,
  );
  const [heroUrl, setHeroUrl] = useState(content.heroMediaUrl);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    content.featuredCollectionIds,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    const fd = new FormData();
    fd.set("image", file);
    const result = await uploadShopHeroImageAction(fd);
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    setHeroUrl(result.url);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleCollection(id: string) {
    setSelectedCollections((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= MAX_FEATURED_COLLECTIONS) return prev;
      return [...prev, id];
    });
  }

  if (!entitled) {
    return (
      <div className="space-y-3 rounded-[20px] border border-border px-5 py-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Shop page content
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A hero image, an intro line, and featured collections for your shop
            are a Plus feature.
          </p>
        </div>
        {(content.heroMediaUrl ||
          content.introText ||
          content.featuredCollectionIds.length > 0) && (
          <p className="text-xs text-muted-foreground">
            Your saved shop content is kept and reappears if you upgrade.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-[20px] border border-border px-5 py-4"
    >
      <div>
        <p className="text-sm font-medium text-foreground">Shop page content</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Shown on your standalone shop checkout page and in the shop preview on
          your booking page.
        </p>
      </div>

      <input type="hidden" name="heroMediaUrl" value={heroUrl ?? ""} />

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Hero image</p>
        {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroUrl}
            alt=""
            className="h-32 w-full rounded-[10px] object-cover"
          />
        )}
        <div className="flex items-center gap-3">
          <label className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-foreground/40">
            {heroUrl ? "Replace image" : "Upload image"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFile}
              disabled={uploading}
            />
          </label>
          {heroUrl && (
            <button
              type="button"
              onClick={() => setHeroUrl(null)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Remove
            </button>
          )}
          {uploading && (
            <span className="text-xs text-muted-foreground">Uploading…</span>
          )}
        </div>
        {uploadError && (
          <p className="text-sm text-destructive">{uploadError}</p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="shop-intro-text"
          className="text-sm font-medium text-foreground"
        >
          Intro line
        </label>
        <textarea
          id="shop-intro-text"
          name="introText"
          defaultValue={content.introText ?? ""}
          maxLength={MAX_INTRO_TEXT}
          rows={2}
          placeholder="Fresh prints every month."
          className="w-full rounded-[10px] border border-border px-3 py-2 text-sm text-foreground"
        />
      </div>

      {collections.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Featured collections
          </p>
          <p className="text-xs text-muted-foreground">
            Choose up to {MAX_FEATURED_COLLECTIONS} to promote.
          </p>
          <ul className="flex flex-wrap gap-2">
            {collections.map((c) => {
              const checked = selectedCollections.includes(c.id);
              const disabled =
                !checked &&
                selectedCollections.length >= MAX_FEATURED_COLLECTIONS;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggleCollection(c.id)}
                    disabled={disabled}
                    aria-pressed={checked}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      checked
                        ? "border-foreground bg-foreground/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/40"
                    }`}
                  >
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
          {selectedCollections.map((id) => (
            <input
              key={id}
              type="hidden"
              name="featuredCollectionIds"
              value={id}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save shop content"}
        </button>
        {state && "error" in state && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state && "success" in state && (
          <p className="text-sm text-muted-foreground">Saved.</p>
        )}
      </div>
    </form>
  );
}
