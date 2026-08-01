"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/goods";
import {
  removeFromWishlistAction,
  moveWishlistItemToCartAction,
} from "./actions";
import type { WishlistDisplayItem } from "@/lib/server/shop-wishlist";

export function WishlistView({
  initialItems,
}: {
  initialItems: WishlistDisplayItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [movedNotice, setMovedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const remove = (wishlistItemId: string) => {
    setError(null);
    setPendingId(wishlistItemId);
    startTransition(async () => {
      const result = await removeFromWishlistAction({ wishlistItemId });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems(result.wishlist);
    });
  };

  const moveToCart = (wishlistItemId: string) => {
    setError(null);
    setMovedNotice(null);
    setPendingId(wishlistItemId);
    startTransition(async () => {
      const result = await moveWishlistItemToCartAction({
        wishlistItemId,
        quantity: 1,
      });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems(result.wishlist);
      setMovedNotice("Added to that artist's cart.");
    });
  };

  if (items.length === 0) {
    return (
      <p className="rounded-[14px] border border-border px-4 py-6 text-sm text-muted-foreground">
        Nothing saved yet. Heart an item on a shop page to save it here.
      </p>
    );
  }

  const byArtist = new Map<string, WishlistDisplayItem[]>();
  for (const item of items) {
    const list = byArtist.get(item.artistId) ?? [];
    list.push(item);
    byArtist.set(item.artistId, list);
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {movedNotice && (
        <p className="rounded-md border border-border px-3 py-2 text-sm text-foreground">
          {movedNotice}
        </p>
      )}
      {[...byArtist.entries()].map(([artistId, group]) => (
        <section key={artistId} className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">
            {group[0].artistName}
          </h2>
          <ul className="space-y-2">
            {group.map((item) => (
              <li
                key={item.wishlistItemId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                    {item.variantName ? ` · ${item.variantName}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatPrice(item.unitAmount, item.currency)}
                    {item.available ? "" : " · unavailable right now"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.artistSlug && (
                    <Link
                      href={`/${item.artistSlug}/shop/checkout`}
                      className="text-xs text-muted-foreground underline"
                    >
                      View shop
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => moveToCart(item.wishlistItemId)}
                    disabled={
                      !item.available || pendingId === item.wishlistItemId
                    }
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
                  >
                    Move to cart
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item.wishlistItemId)}
                    disabled={pendingId === item.wishlistItemId}
                    aria-label={`Remove ${item.title} from wishlist`}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
