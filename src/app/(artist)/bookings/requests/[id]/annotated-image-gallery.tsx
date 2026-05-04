"use client";

import { useEffect, useState } from "react";
import type { Annotation } from "@/lib/annotations";

type ImageWithAnnotations = {
  url: string;
  annotations: Annotation[] | null;
};

export default function AnnotatedImageGallery({
  images,
}: {
  images: ImageWithAnnotations[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [hiddenMarkers, setHiddenMarkers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight")
        setOpen((i) =>
          i !== null ? Math.min(i + 1, images.length - 1) : null,
        );
      if (e.key === "ArrowLeft")
        setOpen((i) => (i !== null ? Math.max(i - 1, 0) : null));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  function toggleMarker(id: string) {
    setHiddenMarkers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {images.map((img, i) => {
          const count = img.annotations?.length ?? 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setOpen(i)}
              className="relative aspect-square rounded-md overflow-hidden border border-border hover:border-foreground transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="w-full h-full object-cover"
              />
              {count > 0 && (
                <span className="absolute top-1 right-1 rounded-full bg-brand-mustard text-brand-charcoal text-xs font-bold leading-none px-1.5 py-0.5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {open !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setOpen(null)}
        >
          {/* Prev */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((i) => (i !== null ? Math.max(i - 1, 0) : null));
            }}
            disabled={open === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-3xl disabled:opacity-20 px-4 py-2"
          >
            ‹
          </button>

          {/* Content */}
          <div
            className="flex flex-col items-center gap-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[open].url}
                alt=""
                className="max-h-[60vh] max-w-[85vw] object-contain rounded-md"
              />

              {/* Annotation markers overlaid */}
              {(images[open].annotations ?? []).map((ann, idx) => {
                if (hiddenMarkers.has(ann.id)) return null;
                return (
                  <div
                    key={ann.id}
                    style={{
                      left: `${ann.x * 100}%`,
                      top: `${ann.y * 100}%`,
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border-2 border-background shadow flex items-center justify-center"
                  >
                    <span className="text-background text-xs font-bold leading-none">
                      {idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Annotation list */}
            {(images[open].annotations?.length ?? 0) > 0 && (
              <div className="w-full max-w-sm space-y-2 px-2">
                {images[open].annotations!.map((ann, idx) => {
                  const hidden = hiddenMarkers.has(ann.id);
                  return (
                    <div key={ann.id} className="flex items-start gap-2">
                      <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-white flex items-center justify-center text-background text-xs font-bold leading-none">
                        {idx + 1}
                      </span>
                      <p
                        className={`flex-1 text-sm leading-relaxed ${hidden ? "text-white/40" : "text-white"}`}
                      >
                        {ann.comment || (
                          <span className="text-white/50 italic">
                            no comment
                          </span>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleMarker(ann.id)}
                        title={hidden ? "Show marker" : "Hide marker"}
                        className="flex-shrink-0 text-base leading-none opacity-60 hover:opacity-100 transition-opacity"
                      >
                        {hidden ? "🙈" : "👁"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Next */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((i) =>
                i !== null ? Math.min(i + 1, images.length - 1) : null,
              );
            }}
            disabled={open === images.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-3xl disabled:opacity-20 px-4 py-2"
          >
            ›
          </button>

          <button
            type="button"
            onClick={() => setOpen(null)}
            className="absolute top-4 right-4 text-white text-xl px-3 py-1"
          >
            ×
          </button>

          <p className="absolute bottom-4 text-white/50 text-sm">
            {open + 1} / {images.length}
          </p>
        </div>
      )}
    </>
  );
}
