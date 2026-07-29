"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Spinner from "@/components/spinner";
import {
  COLLECTION_NAME_MAX,
  MAX_COLLECTIONS,
} from "@inklee/shared/collections";
import {
  saveCollectionAction,
  deleteCollectionAction,
  setProductCollectionAction,
} from "./actions";

type State = { error: string } | { success: true } | null;

export type CollectionRow = {
  id: string;
  name: string;
  position: number;
  is_public_visible: boolean;
  /** How many products sit in it, so an artist can see what a delete affects. */
  productCount: number;
};

export type UnassignedProduct = { id: string; title: string };

const FIELD =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function CollectionForm({
  entitled,
  existing,
  onDone,
}: {
  entitled: boolean;
  existing?: CollectionRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveCollectionAction,
    null,
  );

  useEffect(() => {
    if (state && "success" in state) onDone();
  }, [state, onDone]);

  return (
    <form
      action={action}
      className="space-y-3 rounded-md border border-border p-4"
    >
      {existing && <input type="hidden" name="id" value={existing.id} />}
      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="c-name" className="text-xs text-muted-foreground">
          Name
        </label>
        <input
          id="c-name"
          name="name"
          required
          maxLength={COLLECTION_NAME_MAX}
          defaultValue={existing?.name ?? ""}
          placeholder="Prints"
          className={FIELD}
        />
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          name="is_public_visible"
          defaultChecked={existing?.is_public_visible ?? true}
          className="accent-foreground"
        />
        <span className="text-sm text-muted-foreground">
          Show this section on your shop
        </span>
      </label>
      <p className="text-xs text-muted-foreground">
        Hiding a section does not hide its products. They move in with the
        ungrouped ones.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !entitled}
          className="rounded-full bg-brand-mustard px-5 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? (
            <Spinner className="w-4 h-4 mx-auto" />
          ) : existing ? (
            "Save changes"
          ) : (
            "Create collection"
          )}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function CollectionsManager({
  collections,
  products,
  entitled,
}: {
  collections: CollectionRow[];
  /** Every product, with its current collection, for the assignment list. */
  products: (UnassignedProduct & { collectionId: string | null })[];
  entitled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const atCap = collections.length >= MAX_COLLECTIONS;

  return (
    <div className="space-y-6">
      {!entitled && (
        <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
          Collections are part of Plus. Your shop shows one list until then, and
          any sections you already made are kept.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        {collections.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No sections yet. Everything shows as one list.
          </p>
        )}

        {collections.map((c) =>
          editingId === c.id ? (
            <CollectionForm
              key={c.id}
              entitled={entitled}
              existing={c}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div
              key={c.id}
              className={`rounded-md border border-border px-4 py-3 ${
                c.is_public_visible ? "" : "opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {c.name}
                </span>
                {!c.is_public_visible && (
                  <span className="rounded border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                    Hidden
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {c.productCount === 1
                    ? "1 product"
                    : `${c.productCount} products`}
                </span>
              </div>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingId(c.id)}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    // Named consequence, not a bare "are you sure": the whole
                    // question is what happens to the products inside.
                    if (
                      !confirm(
                        c.productCount > 0
                          ? `Delete "${c.name}"? Its ${c.productCount} product${c.productCount === 1 ? "" : "s"} stay in your shop, just ungrouped.`
                          : `Delete "${c.name}"?`,
                      )
                    ) {
                      return;
                    }
                    startTransition(async () => {
                      const r = await deleteCollectionAction(c.id);
                      if (r && "error" in r) setError(r.error);
                    });
                  }}
                  className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ),
        )}

        {adding ? (
          <CollectionForm entitled={entitled} onDone={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={atCap}
            title={atCap ? `You can have up to ${MAX_COLLECTIONS}.` : undefined}
            className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            + New collection
          </button>
        )}
      </div>

      {collections.length > 0 && products.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            What goes where
          </h2>
          <ul className="space-y-2">
            {products.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-4 py-2.5"
              >
                <span className="text-sm text-foreground">{p.title}</span>
                <select
                  value={p.collectionId ?? ""}
                  disabled={pending || !entitled}
                  aria-label={`Collection for ${p.title}`}
                  onChange={(e) => {
                    const next = e.target.value || null;
                    startTransition(async () => {
                      const r = await setProductCollectionAction(p.id, next);
                      if (r && "error" in r) setError(r.error);
                    });
                  }}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
                >
                  <option value="">No section</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
