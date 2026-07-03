"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// Brand-styled select. Replaces the native <select> popup — which is browser
// chrome and can't be themed — with a custom listbox popover matching the
// brand (bone surface, mustard selected option, rounded), following the
// DateInput pattern. Keeps a native-compatible API (name / value /
// defaultValue / onChange(e) / required) and submits via an sr-only input.
//
// Accessibility: WAI-ARIA listbox pattern — the trigger carries
// aria-haspopup/aria-expanded, the list manages an active option via
// aria-activedescendant, and the keyboard works like a native select:
// ArrowUp/Down, Home/End, Enter/Space, Escape, and first-character typeahead.

export type SelectOption = { value: string; label: string };

const DEFAULT_TRIGGER =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

type Props = {
  options: SelectOption[];
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
  placeholder?: string;
  /** Accessible name when there is no visible <label htmlFor=id>. */
  ariaLabel?: string;
};

export default function SelectInput({
  options,
  name,
  id,
  required,
  disabled,
  value: controlled,
  defaultValue,
  onChange,
  className,
  placeholder = "Select an option",
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = controlled ?? internal;
  const selectedIndex = options.findIndex((o) => o.value === value);
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : 0,
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ query: string; at: number }>({
    query: "",
    at: 0,
  });
  const reactId = useId();
  const listId = `${id ?? reactId}-listbox`;
  const optionId = (i: number) => `${id ?? reactId}-opt-${i}`;

  const setValue = (v: string) => {
    if (controlled === undefined) setInternal(v);
    onChange?.({ target: { value: v } });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Move focus into the list on open (autoFocus is unreliable on non-form
  // elements) and keep the active option in view while navigating.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const POPOVER_H = 280;
  const openList = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < POPOVER_H && rect.top > spaceBelow);
    }
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const commit = (i: number) => {
    const opt = options[i];
    if (!opt) return;
    setValue(opt.value);
    close();
  };

  const moveActive = (delta: number) => {
    setActiveIndex((i) => Math.min(options.length - 1, Math.max(0, i + delta)));
  };

  const handleTypeahead = (key: string) => {
    const now = Date.now();
    const t = typeahead.current;
    t.query = now - t.at > 700 ? key : t.query + key;
    t.at = now;
    const q = t.query.toLowerCase();
    const start = q.length === 1 ? activeIndex + 1 : activeIndex;
    for (let step = 0; step < options.length; step++) {
      const i = (start + step) % options.length;
      if (options[i].label.toLowerCase().startsWith(q)) {
        setActiveIndex(i);
        if (!open) commit(i);
        return;
      }
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      if (!open) openList();
      return;
    }
    if (e.key.length === 1 && /\S/.test(e.key)) handleTypeahead(e.key);
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      e.preventDefault();
      handleTypeahead(e.key);
    }
  };

  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        name={name}
        value={value}
        required={required}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      />
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKeyDown}
        className={`flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${className ?? DEFAULT_TRIGGER}`}
      >
        <span
          className={`truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.8}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={optionId(activeIndex)}
          onKeyDown={onListKeyDown}
          className={`absolute left-0 z-30 max-h-64 w-full min-w-[10rem] overflow-y-auto rounded-xl border border-border bg-background p-1.5 shadow-lg focus:outline-none ${
            openUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <li
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-[color:var(--color-workspace-hover)] text-foreground"
                    : "text-foreground"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-mustard">
                    <Check
                      className="h-3 w-3 text-brand-charcoal"
                      strokeWidth={3.5}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
