"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAP_LOCATION_CATEGORY_LABELS,
  type PublicMapPin,
} from "@inklee/shared/map-directory";

// Google-Maps-style search: debounced autosuggest, keyboard driven, abort on
// every keystroke so a slow response never clobbers a newer one. Typo and
// accent tolerance live server-side in the map_search RPC. The box owns its
// query + result state; picking a result hands the full pin up to the map,
// which flies to it and opens its detail panel.
export default function MapSearchBox({
  onSelect,
}: {
  onSelect: (pin: PublicMapPin) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicMapPin[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    abortRef.current?.abort();
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setActive(0);
      return;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    setLoading(true);
    fetch(`/api/map/search?q=${encodeURIComponent(trimmed)}`, {
      signal: abort.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { results: PublicMapPin[] } | null) => {
        setResults(body?.results ?? []);
        setActive(0);
        setLoading(false);
      })
      .catch(() => {
        // Aborted (superseded) or offline: leave the last results in place.
      });
  }, []);

  // Debounce keystrokes; the trailing call is the one that fetches.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // Close the dropdown when focus leaves the whole widget.
  useEffect(() => {
    const onDocPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, []);

  const pick = (pin: PublicMapPin) => {
    onSelect(pin);
    setQuery(pin.name);
    setOpen(false);
    setResults([]);
    inputRef.current?.blur();
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === "Escape") {
      if (query) clear();
      else setOpen(false);
    }
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div
      ref={rootRef}
      className="absolute left-3 top-3 z-10 w-[min(20rem,calc(100%-1.5rem))]"
    >
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur focus-within:border-foreground/40">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search studios by name or city"
          aria-label="Search studios"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {loading ? (
          <span
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-muted-foreground/40 border-t-foreground"
            aria-hidden="true"
          />
        ) : query ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="shrink-0 rounded-md px-1 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <ul className="mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-background/98 py-1 shadow-lg backdrop-blur">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {loading ? "Searching…" : "No studios found."}
            </li>
          ) : (
            results.map((pin, i) => (
              <li key={pin.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(pin)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left ${
                    i === active ? "bg-muted/40" : "hover:bg-muted/30"
                  }`}
                >
                  <span className="w-full truncate text-sm text-foreground">
                    {pin.name}
                    {pin.claimed ? (
                      <span className="ml-1.5 text-xs text-brand-mustard">
                        ✓
                      </span>
                    ) : null}
                  </span>
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {MAP_LOCATION_CATEGORY_LABELS[pin.category]}
                    {pin.city ? ` · ${pin.city}` : ""}
                    {pin.country ? ` · ${pin.country}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
