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

export type ProductVariantRow = {
  id: string;
  name: string;
  priceAmount: number | null;
};
export type ProductRow = {
  id: string;
  title: string;
  priceAmount: number;
  /** This product's ACTIVE variants only (FD6) — the picker offers a choice
   *  from exactly these, matching what the checkout itself will accept. */
  variants: ProductVariantRow[];
};

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

/** One (product, variant) slot in the bundle-being-edited. A product may hold
 *  more than one slot (FD6): once per distinct variant. */
type Slot = { productId: string; variantId: string | null; quantity: number };

/** The per-bundle product picker: choose products + quantities, then save the
 *  whole set at once (the core replaces the bundle's items to match). A
 *  product WITH active variants gets a picker per slot (FD6) — the artist
 *  fixes the variant when building the bundle; there is no buyer-time choice.
 *  Shows the saving vs buying the selected products separately at their list
 *  (or, when a variant is chosen, variant) prices. */
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
  const [slots, setSlots] = useState<Slot[]>(() =>
    bundle.items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      quantity: it.quantity,
    })),
  );

  const productById = new Map(products.map((p) => [p.id, p]));
  const overCap = slots.length > MAX_BUNDLE_ITEMS;
  // A slot on a product WITH active variants but no selection blocks save
  // rather than silently sending an incomplete bundle (the same rule the
  // checkout enforces server-side as `component_needs_variant`).
  const needsVariantCount = slots.filter((s) => {
    const p = productById.get(s.productId);
    return !!p && p.variants.length > 0 && !s.variantId;
  }).length;

  const components = slots
    .map((s) => {
      const p = productById.get(s.productId);
      if (!p) return null;
      const variant = s.variantId
        ? p.variants.find((v) => v.id === s.variantId)
        : undefined;
      const priceAmount = variant?.priceAmount ?? p.priceAmount;
      return { priceAmount, quantity: s.quantity };
    })
    .filter((c): c is { priceAmount: number; quantity: number } => c !== null);
  const savings = bundleSavings(bundle.priceAmount, components);

  function toggleProduct(id: string) {
    setSaved(false);
    setSlots((prev) => {
      const has = prev.some((s) => s.productId === id);
      // Toggling off removes EVERY slot for this product, including any
      // extra variant slots added below.
      if (has) return prev.filter((s) => s.productId !== id);
      return [...prev, { productId: id, variantId: null, quantity: 1 }];
    });
  }
  function addVariantSlot(productId: string) {
    setSaved(false);
    setSlots((prev) => [...prev, { productId, variantId: null, quantity: 1 }]);
  }
  function setSlotVariant(index: number, variantId: string | null) {
    setSaved(false);
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, variantId } : s)),
    );
  }
  function setSlotQuantity(index: number, n: number) {
    setSaved(false);
    setSlots((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, quantity: Math.max(1, Math.floor(n) || 1) } : s,
      ),
    );
  }
  function removeSlot(index: number) {
    setSaved(false);
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    onError(null);
    setSaved(false);
    const items = slots.map((s) => ({
      productId: s.productId,
      quantity: s.quantity,
      variantId: s.variantId,
    }));
    startTransition(async () => {
      const r = await setBundleItemsAction(bundle.id, items);
      if (r && "error" in r) onError(r.error);
      else setSaved(true);
    });
  }

  const canSave = !overCap && needsVariantCount === 0;

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Products in this bundle. Tick each one and set how many. A product with
        options needs a variant chosen for each slot.
      </p>
      <ul className="space-y-1.5">
        {products.map((p) => {
          const productSlots = slots
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => s.productId === p.id);
          const on = productSlots.length > 0;
          const hasVariants = p.variants.length > 0;
          const usedVariantIds = new Set(
            productSlots.map(({ s }) => s.variantId).filter((v) => v !== null),
          );
          const canAddAnotherVariant =
            on && hasVariants && usedVariantIds.size < p.variants.length;

          return (
            <li key={p.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!entitled}
                  onClick={() => toggleProduct(p.id)}
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
              </div>

              {productSlots.map(({ s, i }) => (
                <div key={i} className="ml-4 flex flex-wrap items-center gap-2">
                  {hasVariants && (
                    <select
                      value={s.variantId ?? ""}
                      onChange={(e) =>
                        setSlotVariant(i, e.target.value || null)
                      }
                      aria-label={`Variant of ${p.title}`}
                      className={`${FIELD} w-auto`}
                    >
                      <option value="">Needs a variant</option>
                      {p.variants
                        .filter(
                          (v) =>
                            v.id === s.variantId || !usedVariantIds.has(v.id),
                        )
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                    </select>
                  )}
                  <input
                    type="number"
                    min={1}
                    value={s.quantity}
                    onChange={(e) => setSlotQuantity(i, Number(e.target.value))}
                    aria-label={`Quantity of ${p.title}${s.variantId ? ` ${p.variants.find((v) => v.id === s.variantId)?.name ?? ""}` : ""}`}
                    className="w-16 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground"
                  />
                  {productSlots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlot(i)}
                      className={LINK}
                    >
                      Remove
                    </button>
                  )}
                  {hasVariants && !s.variantId && (
                    <span className="text-xs text-destructive">
                      Needs a variant
                    </span>
                  )}
                </div>
              ))}

              {canAddAnotherVariant && (
                <button
                  type="button"
                  onClick={() => addVariantSlot(p.id)}
                  className={`ml-4 ${LINK}`}
                >
                  + Add another variant
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {slots.length > 0 && (
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
      {needsVariantCount > 0 && (
        <p className="text-xs text-destructive">
          Choose a variant for every highlighted product before saving.
        </p>
      )}

      <button
        type="button"
        disabled={pending || !entitled || !canSave}
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
