"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareImageUpload } from "@/lib/image-compress";
import {
  MAX_STUDIO_PHOTOS,
  MIN_STUDIO_PHOTOS,
} from "@inklee/shared/studio-profile";
import {
  deleteStudioPhotoAction,
  uploadStudioLogoAction,
  uploadStudioPhotoAction,
} from "../actions";
import type { StudioMedia } from "@/lib/server/studios";

export default function StudioMediaSection({
  studioId,
  media,
}: {
  studioId: string;
  media: StudioMedia;
}) {
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const upload = (
    file: File,
    action: (studioId: string, fd: FormData) => Promise<{ error?: string }>,
  ) => {
    setError(null);
    // Compression runs INSIDE the transition so pending covers it: no second
    // pick can start while a large photo is still compressing or uploading.
    startTransition(async () => {
      const prepared = await prepareImageUpload(file);
      if ("error" in prepared) {
        setError(prepared.error);
        return;
      }
      const fd = new FormData();
      fd.set("image", prepared.file);
      const result = await action(studioId, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const removePhoto = (photoId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteStudioPhotoAction(studioId, photoId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const label = "text-xs text-muted-foreground";

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Logo and photos</h2>

      {/* Logo */}
      <div className="flex items-center gap-4">
        {media.logoUrl ? (
          // Signed URLs are short-lived, so plain img beats next/image here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.logoUrl}
            alt="Studio logo"
            className="h-16 w-16 rounded-xl border border-border object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
            Logo
          </div>
        )}
        <div className="space-y-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => logoInputRef.current?.click()}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
          >
            {media.logoUrl ? "Replace logo" : "Add logo"}
          </button>
          <p className={label}>Square works best. PNG, JPG, or WebP.</p>
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file, uploadStudioLogoAction);
          }}
        />
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={label}>
            Photos ({media.photos.length} of {MAX_STUDIO_PHOTOS})
          </p>
          <span
            className={`text-xs ${
              media.photos.length >= MIN_STUDIO_PHOTOS
                ? "text-muted-foreground"
                : "text-brand-mustard"
            }`}
          >
            {media.photos.length >= MIN_STUDIO_PHOTOS
              ? "Minimum met"
              : `Need ${MIN_STUDIO_PHOTOS} to publish`}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.photos.map((photo, index) => (
            <div key={photo.id} className="relative">
              {photo.url ? (
                // Signed URLs are short-lived, so plain img beats next/image.
                // Decorative in a management grid; the button is the semantic
                // element.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.url}
                  alt=""
                  className="aspect-square w-full rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                  Photo unavailable
                </div>
              )}
              {/* Always visible: a hidden destructive control is a hazard on
                  touch, and the row counts toward the cap either way. */}
              <button
                type="button"
                disabled={pending}
                onClick={() => removePhoto(photo.id)}
                aria-label={`Delete photo ${index + 1} of ${media.photos.length}`}
                className="absolute right-1 top-1 rounded-md bg-background/80 px-1.5 py-0.5 text-xs text-foreground backdrop-blur transition-colors hover:text-brand-red disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ))}
          {media.photos.length < MAX_STUDIO_PHOTOS ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => photoInputRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-50"
            >
              {pending ? "..." : "+ Add"}
            </button>
          ) : null}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file, uploadStudioPhotoAction);
          }}
        />
        <p className={label}>
          Show the space: stations, the front, the vibe. Artists decide on
          photos.
        </p>
      </div>

      {error ? <p className="text-sm text-brand-red">{error}</p> : null}
    </section>
  );
}
