"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPublicationAction } from "./actions";

export default function PublishControls({
  studioId,
  published,
  publishReady,
  blockers,
}: {
  studioId: string;
  published: boolean;
  publishReady: boolean;
  blockers: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (publish: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setPublicationAction(studioId, publish);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="space-y-2 rounded-2xl border border-border p-5">
      {published ? (
        <>
          <p className="text-sm text-foreground">
            Your studio is published. Unpublish to take it off the map while you
            make changes.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(false)}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
          >
            Unpublish
          </button>
        </>
      ) : publishReady ? (
        <>
          <p className="text-sm text-foreground">
            Everything required is in place. Publish to send your studio to the
            map (an admin gives new studios a quick look first).
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(true)}
            className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Publish studio
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-foreground">
            A few things left before you can publish:
          </p>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </>
      )}
      {error ? <p className="text-sm text-brand-red">{error}</p> : null}
    </section>
  );
}
