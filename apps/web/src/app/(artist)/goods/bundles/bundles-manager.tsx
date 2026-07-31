"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Spinner from "@/components/spinner";
import {
  BUNDLE_NAME_MAX,
  MAX_BUNDLE_ITEMS,
  canDeleteBundle,
  liveBundles,
  archivedBundles,
  bundleSavings,
} from "@inklee/shared/bundles";
import type { BundleWithItems } from "@/lib/server/bundles";
import { formatPrice } from "@inklee/shared/goods";
import {
  saveBundleAction,
  deleteBundleAction,
  setBundleArchivedAction,
  setBundleItemsAction,
} from "./actions";

type State = { error: string } | { success: true } | null;

export type ProductRow = { id: string; title: string; priceAmount: number };

const FIELD =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const LINK =
  "text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50";

function BundleForm({
  entitled,
  existing,
  onDone,
}: {
  entitled: boolean;
  existing?: BundleWithItems;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveBundleAction,
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
        <label htmlFor="b-name" className="text-xs text-muted-foreground">
          Name
        </label>
        <input
          id="b-name"
          name="name"
          required
          maxLength={BUNDLE_NAME_MAX}
          defaultValue={existing?.name ?? ""}
          placeholder="Starter kit"
          className={FIELD}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="b-price" className="text-xs text-muted-foreground">
          Bundle price
        </label>
        <input
          id="b-price"
          name="price_amount"
          inputMode="decimal"
          defaultValue={existing ? existing.priceAmount.toFixed(2) : ""}
          placeholder="40.00"
          className={FIELD}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          name="is_public_visible"
          defaultChecked={existing?.isPublicVisible ?? true}
          className="accent-foreground"
        />
        <span className="text-sm text-muted-foreground">
          Show this bundle on your shop
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !entitled}
          className="rounded-full bg-brand-mustard px-5 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? (
            <Spinner className="mx-auto h-4 w-4" />
          ) : existing ? (
            "Save changes"
          ) : (
            "Create bundle"
          )}
        </button>
        <button type="button" onClick={onDone} className={LINK}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The per-bundle product picker: choose products + quantities, then save the
 *  whole set at once (the core replaces the bundle's items to match). Shows the
 *  saving vs buying the selected products separately at their list prices. */
function BundleItemsEditor({
  bundle,
  products,
  entitled,
  onError,
}: {
  bundle: BundleWithItems;
  products: ProductRow[];
  entitled: boolean;
  onError: (e: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  // productId -> quantity, seeded from the bundle's current items.
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(bundle.items.map((it) => [it.productId, it.quantity])),
  );

  const selectedIds = Object.keys(qty);
  const overCap = selectedIds.length > MAX_BUNDLE_ITEMS;

  const components = selectedIds
    .map((id) => {
      const p = products.find((x) => x.id === id);
      return p ? { priceAmount: p.priceAmount, quantity: qty[id] } : null;
    })
    .filter((c): c is { priceAmount: number; quantity: number } => c !== null);
  const savings = bundleSavings(bundle.priceAmount, components);

  function toggle(id: string) {
    setSaved(false);
    setQty((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = 1;
      return next;
    });
  }
  function setQuantity(id: string, n: number) {
    setSaved(false);
    setQty((prev) => ({ ...prev, [id]: Math.max(1, Math.floor(n) || 1) }));
  }

  function save() {
    onError(null);
    setSaved(false);
    const items = selectedIds.map((id) => ({
      productId: id,
      quantity: qty[id],
    }));
    startTransition(async () => {
      const r = await setBundleItemsAction(bundle.id, items);
      if (r && "error" in r) onError(r.error);
      else setSaved(true);
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Products in this bundle. Tick each one and set how many.
      </p>
      <ul className="space-y-1.5">
        {products.map((p) => {
          const on = p.id in qty;
          return (
            <li key={p.id} className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={on}
                disabled={!entitled}
                onClick={() => toggle(p.id)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
                  on
                    ? "border-foreground bg-foreground/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40"
                }`}
              >
                {p.title}
                <span className="ml-1 text-muted-foreground">
                  {formatPrice(p.priceAmount, bundle.currency)}
                </span>
              </button>
              {on && (
                <input
                  type="number"
                  min={1}
                  value={qty[p.id]}
                  onChange={(e) => setQuantity(p.id, Number(e.target.value))}
                  aria-label={`Quantity of ${p.title}`}
                  className="w-16 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground"
                />
              )}
            </li>
          );
        })}
      </ul>

      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {savings.isSaving ? (
            <>
              Bundle {formatPrice(bundle.priceAmount, bundle.currency)}, parts{" "}
              {formatPrice(savings.componentTotal, bundle.currency)}.{" "}
              <span className="text-foreground">
                Save {formatPrice(savings.savingsAmount, bundle.currency)} (
                {savings.savingsPercent}%).
              </span>
            </>
          ) : (
            <>
              Bundle {formatPrice(bundle.priceAmount, bundle.currency)}, parts{" "}
              {formatPrice(savings.componentTotal, bundle.currency)}. This
              bundle does not cost less than buying the parts.
            </>
          )}
        </p>
      )}
      {overCap && (
        <p className="text-xs text-destructive">
          A bundle can hold at most {MAX_BUNDLE_ITEMS} products.
        </p>
      )}

      <button
        type="button"
        disabled={pending || !entitled || overCap}
        onClick={save}
        className="rounded-full border border-border px-4 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/40 disabled:opacity-50"
      >
        {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Save products"}
      </button>
      {saved && (
        <span className="ml-2 text-xs text-muted-foreground">Saved.</span>
      )}
    </div>
  );
}

export default function BundlesManager({
  bundles,
  products,
  entitled,
}: {
  bundles: BundleWithItems[];
  products: ProductRow[];
  entitled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const live = liveBundles(bundles) as BundleWithItems[];
  const archived = archivedBundles(bundles) as BundleWithItems[];

  function run(fn: () => Promise<State>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r && "error" in r) setError(r.error);
    });
  }

  function BundleCard({
    b,
    isArchived,
  }: {
    b: BundleWithItems;
    isArchived: boolean;
  }) {
    const deletable = canDeleteBundle(b, b.items.length);
    return (
      <div
        className={`rounded-md border border-border px-4 py-3 ${
          b.isPublicVisible && !isArchived ? "" : "opacity-60"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{b.name}</span>
          <span className="text-sm text-foreground">
            {formatPrice(b.priceAmount, b.currency)}
          </span>
          {isArchived ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
              Archived
            </span>
          ) : (
            !b.isPublicVisible && (
              <span className="rounded border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                Hidden
              </span>
            )
          )}
          <span className="text-xs text-muted-foreground">
            {b.items.length === 1 ? "1 product" : `${b.items.length} products`}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-3">
          {!isArchived && (
            <button
              type="button"
              onClick={() => setEditingId(b.id)}
              className={LINK}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            disabled={pending || !entitled}
            onClick={() =>
              run(() => setBundleArchivedAction(b.id, !isArchived))
            }
            className={LINK}
          >
            {isArchived ? "Restore" : "Archive"}
          </button>
          <button
            type="button"
            disabled={pending || !entitled || !deletable}
            // Archive-first (B4): a live bundle must be archived before delete,
            // so the button explains the refusal rather than failing on click.
            title={deletable ? undefined : "Archive this bundle first."}
            onClick={() => {
              if (!confirm(`Delete "${b.name}"?`)) return;
              run(() => deleteBundleAction(b.id));
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
          Bundles are part of Plus. Any bundles you already made are kept and
          will show again when Plus is active.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        {live.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No bundles yet.</p>
        )}

        {live.map((b) =>
          editingId === b.id ? (
            <div key={b.id} className="space-y-2">
              <BundleForm
                entitled={entitled}
                existing={b}
                onDone={() => setEditingId(null)}
              />
              <BundleItemsEditor
                bundle={b}
                products={products}
                entitled={entitled}
                onError={setError}
              />
            </div>
          ) : (
            <BundleCard key={b.id} b={b} isArchived={false} />
          ),
        )}

        {adding ? (
          <BundleForm entitled={entitled} onDone={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={!entitled}
            className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            + New bundle
          </button>
        )}
      </div>

      {archived.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Archived
          </h2>
          <p className="text-xs text-muted-foreground">
            Archived bundles keep their products. Restore one and it comes back
            as it was, or delete it once archived.
          </p>
          {archived.map((b) => (
            <BundleCard key={b.id} b={b} isArchived />
          ))}
        </div>
      )}
    </div>
  );
}
