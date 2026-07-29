"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Spinner from "@/components/spinner";
import {
  COLLECTION_NAME_MAX,
  canDeleteCollection,
  liveCollections,
  archivedCollections,
  type CollectionMembership,
} from "@inklee/shared/collections";
import type { CollectionWithCount } from "@/lib/server/collections";
import {
  saveCollectionAction,
  deleteCollectionAction,
  setCollectionArchivedAction,
  addProductToCollectionAction,
  removeProductFromCollectionAction,
} from "./actions";

type State = { error: string } | { success: true } | null;

export type ProductRow = { id: string; title: string };

const FIELD =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const LINK =
  "text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50";

function CollectionForm({
  entitled,
  existing,
  onDone,
}: {
  entitled: boolean;
  existing?: CollectionWithCount;
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
          defaultChecked={existing?.isPublicVisible ?? true}
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
        <button type="button" onClick={onDone} className={LINK}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function CollectionsManager({
  collections,
  products,
  memberships,
  entitled,
}: {
  collections: CollectionWithCount[];
  products: ProductRow[];
  memberships: CollectionMembership[];
  entitled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const live = liveCollections(collections) as CollectionWithCount[];
  const archived = archivedCollections(collections) as CollectionWithCount[];

  const inCollection = new Set(
    memberships.map((m) => `${m.productId}:${m.collectionId}`),
  );

  function run(fn: () => Promise<State>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r && "error" in r) setError(r.error);
    });
  }

  function CollectionCard({
    c,
    isArchived,
  }: {
    c: CollectionWithCount;
    isArchived: boolean;
  }) {
    const deletable = canDeleteCollection(c, c.productCount);
    return (
      <div
        className={`rounded-md border border-border px-4 py-3 ${
          c.isPublicVisible && !isArchived ? "" : "opacity-60"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{c.name}</span>
          {isArchived ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
              Archived
            </span>
          ) : (
            !c.isPublicVisible && (
              <span className="rounded border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                Hidden
              </span>
            )
          )}
          <span className="text-xs text-muted-foreground">
            {c.productCount === 1 ? "1 product" : `${c.productCount} products`}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-3">
          {!isArchived && (
            <button
              type="button"
              onClick={() => setEditingId(c.id)}
              className={LINK}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            disabled={pending || !entitled}
            onClick={() =>
              run(() => setCollectionArchivedAction(c.id, !isArchived))
            }
            className={LINK}
          >
            {isArchived ? "Restore" : "Archive"}
          </button>
          <button
            type="button"
            disabled={pending || !entitled || !deletable}
            // The button explains its own refusal rather than failing on
            // click. A populated live section has arranging work in it that
            // nothing restores, so archive is the reversible way out and
            // delete waits until there is nothing left to lose.
            title={
              deletable
                ? undefined
                : "Archive this collection first, or empty it."
            }
            onClick={() => {
              if (
                !confirm(
                  c.productCount > 0
                    ? `Delete "${c.name}"? Its ${c.productCount} product${c.productCount === 1 ? "" : "s"} stay in your shop, just ungrouped.`
                    : `Delete "${c.name}"?`,
                )
              ) {
                return;
              }
              run(() => deleteCollectionAction(c.id));
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

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
        {live.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No sections yet. Everything shows as one list.
          </p>
        )}

        {live.map((c) =>
          editingId === c.id ? (
            <CollectionForm
              key={c.id}
              entitled={entitled}
              existing={c}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <CollectionCard key={c.id} c={c} isArchived={false} />
          ),
        )}

        {adding ? (
          <CollectionForm entitled={entitled} onDone={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={!entitled}
            className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            + New collection
          </button>
        )}
      </div>

      {archived.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Archived
          </h2>
          <p className="text-xs text-muted-foreground">
            Archived sections keep their products and their order. Restore one
            and it comes back exactly as it was.
          </p>
          {archived.map((c) => (
            <CollectionCard key={c.id} c={c} isArchived />
          ))}
        </div>
      )}

      {live.length > 0 && products.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            What goes where
          </h2>
          <p className="text-xs text-muted-foreground">
            Tick every section a product belongs in. It can be in several.
          </p>
          <ul className="space-y-2">
            {products.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-border px-4 py-2.5"
              >
                <span className="text-sm text-foreground">{p.title}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {live.map((c) => {
                    const on = inCollection.has(`${p.id}:${c.id}`);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        disabled={pending || !entitled}
                        onClick={() =>
                          run(() =>
                            on
                              ? removeProductFromCollectionAction(p.id, c.id)
                              : addProductToCollectionAction(p.id, c.id),
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
                          on
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
