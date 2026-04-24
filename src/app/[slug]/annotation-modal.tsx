"use client";

import { useRef, useState } from "react";
import type { Annotation } from "@/lib/annotations";
import {
  MAX_ANNOTATIONS_PER_PHOTO,
  MAX_ANNOTATION_COMMENT_CHARS,
} from "@/lib/annotations";

export default function AnnotationModal({
  imagePreview,
  initialAnnotations,
  onSave,
  onClose,
}: {
  imagePreview: string;
  initialAnnotations: Annotation[];
  onSave: (annotations: Annotation[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Annotation[]>(initialAnnotations);
  const imgRef = useRef<HTMLDivElement>(null);

  function addMarker(clientX: number, clientY: number) {
    if (draft.length >= MAX_ANNOTATIONS_PER_PHOTO) return;
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setDraft((prev) => [
      ...prev,
      { id: crypto.randomUUID(), x, y, comment: "" },
    ]);
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    addMarker(e.clientX, e.clientY);
  }

  function handleImageTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const touch = e.changedTouches[0];
    if (touch) addMarker(touch.clientX, touch.clientY);
  }

  function updateComment(id: string, comment: string) {
    setDraft((prev) => prev.map((a) => (a.id === id ? { ...a, comment } : a)));
  }

  function removeMarker(id: string) {
    setDraft((prev) => prev.filter((a) => a.id !== id));
  }

  const canAddMore = draft.length < MAX_ANNOTATIONS_PER_PHOTO;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-8">
      <div className="w-full max-w-lg rounded-md border-2 border-border bg-background space-y-5 pb-5">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Add notes to this photo
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Mark spots like scars, birthmarks, skin texture, existing tattoos,
              or preferred placement.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 shrink-0 text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Image + markers */}
        <div className="px-5">
          <div
            ref={imgRef}
            onClick={handleImageClick}
            onTouchEnd={handleImageTouchEnd}
            className={`relative w-full overflow-hidden rounded-md border border-border bg-muted/20 select-none ${
              canAddMore ? "cursor-crosshair" : "cursor-not-allowed"
            }`}
            style={{ touchAction: "none" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt=""
              className="w-full h-auto block pointer-events-none"
              draggable={false}
            />

            {/* Markers */}
            {draft.map((ann, idx) => (
              <div
                key={ann.id}
                style={{
                  left: `${ann.x * 100}%`,
                  top: `${ann.y * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-foreground border-2 border-background shadow flex items-center justify-center pointer-events-none"
              >
                <span className="text-background text-xs font-bold leading-none">
                  {idx + 1}
                </span>
              </div>
            ))}

            {/* Empty state hint */}
            {draft.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="bg-black/50 text-white text-sm rounded-md px-3 py-1.5">
                  Tap on the photo to add a note
                </p>
              </div>
            )}

            {/* Cap reached hint */}
            {!canAddMore && (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                <p className="bg-black/50 text-white text-xs rounded px-2 py-1">
                  Max {MAX_ANNOTATIONS_PER_PHOTO} markers reached
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Marker comment list */}
        {draft.length > 0 && (
          <div className="px-5 space-y-2">
            {draft.map((ann, idx) => (
              <div key={ann.id} className="flex items-start gap-2">
                <span className="mt-2.5 flex-shrink-0 w-5 h-5 rounded-full bg-foreground flex items-center justify-center text-background text-xs font-bold">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={ann.comment}
                  onChange={(e) =>
                    updateComment(
                      ann.id,
                      e.target.value.slice(0, MAX_ANNOTATION_COMMENT_CHARS),
                    )
                  }
                  placeholder="Describe this spot…"
                  className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => removeMarker(ann.id)}
                  className="mt-2 text-muted-foreground hover:text-destructive transition-colors text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="px-5 flex gap-2">
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background"
          >
            {draft.length > 0 ? "Save notes" : "Done"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
