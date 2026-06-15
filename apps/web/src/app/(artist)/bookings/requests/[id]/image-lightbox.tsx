"use client";

import { useEffect, useState } from "react";

export default function ImageLightbox({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight")
        setOpen((i) => (i !== null ? Math.min(i + 1, urls.length - 1) : null));
      if (e.key === "ArrowLeft")
        setOpen((i) => (i !== null ? Math.max(i - 1, 0) : null));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, urls.length]);

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {urls.map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            className="aspect-square rounded-md overflow-hidden border border-border hover:border-foreground transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {open !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setOpen(null)}
        >
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

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[open]}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-md"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((i) =>
                i !== null ? Math.min(i + 1, urls.length - 1) : null,
              );
            }}
            disabled={open === urls.length - 1}
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
            {open + 1} / {urls.length}
          </p>
        </div>
      )}
    </>
  );
}
