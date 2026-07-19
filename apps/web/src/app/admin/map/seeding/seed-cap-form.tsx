"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSeedCapAction } from "./actions";

export default function SeedCapForm({
  initialCap,
}: {
  initialCap: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(
    initialCap === null ? "" : String(initialCap),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    setSaved(false);
    const trimmed = value.trim();
    const cap = trimmed === "" ? null : Number(trimmed);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1)) {
      setError("Type a whole number of at least 1, or leave empty for no cap.");
      return;
    }
    startTransition(async () => {
      const result = await setSeedCapAction(cap);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <section className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">
        Seed density cap
      </h2>
      <p className="text-xs text-muted-foreground">
        Maximum seeded entries per ~300 square km area, enforced at conversion
        in both lanes. Empty means no cap (the current default).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="No cap"
          className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <span className="text-xs text-muted-foreground">Saved.</span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
    </section>
  );
}
