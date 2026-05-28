"use client";

import { useActionState, useState } from "react";
import { Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { saveBioPageAction } from "./actions";
import {
  MAX_LINKS,
  MAX_BOOKING_POLICY,
  MAX_LINK_LABEL,
  type BioCustomLink,
  type BioPageSettings,
} from "@/lib/bio-page-settings";

type State = { error: string } | { success: true; note?: string } | null;

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const ICON_BTN =
  "rounded-md border border-border p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40";

function makeLink(): BioCustomLink {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `link-${Date.now()}`;
  return { id, label: "", url: "", isActive: true };
}

export default function BioPageForm({ bioPage }: { bioPage: BioPageSettings }) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveBioPageAction,
    null,
  );

  const [bookingPolicy, setBookingPolicy] = useState(
    bioPage.bookingPolicy ?? "",
  );
  const [links, setLinks] = useState<BioCustomLink[]>(bioPage.customLinks);
  const [showLinks, setShowLinks] = useState(!bioPage.hidden.includes("links"));
  const [showPolicy, setShowPolicy] = useState(
    !bioPage.hidden.includes("policy"),
  );
  const [showShop, setShowShop] = useState(!bioPage.hidden.includes("shop"));

  const updateLink = (id: string, patch: Partial<BioCustomLink>) =>
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLink = (id: string) =>
    setLinks((prev) => prev.filter((l) => l.id !== id));
  const move = (index: number, dir: -1 | 1) =>
    setLinks((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const addLink = () =>
    setLinks((prev) =>
      prev.length >= MAX_LINKS ? prev : [...prev, makeLink()],
    );

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="custom_links" value={JSON.stringify(links)} />

      {/* Links */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Links</h2>
            <p className="text-sm text-muted-foreground">
              Instagram, website, aftercare, portfolio, anything. Shown on your
              public page below the booking form.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="show_links"
              checked={showLinks}
              onChange={(e) => setShowLinks(e.target.checked)}
            />
            Show
          </label>
        </div>

        <div className="space-y-2">
          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          )}
          {links.map((link, i) => (
            <div
              key={link.id}
              className="space-y-2 rounded-md border border-border px-3 py-3"
            >
              <div className="flex gap-2">
                <input
                  value={link.label}
                  onChange={(e) =>
                    updateLink(link.id, {
                      label: e.target.value.slice(0, MAX_LINK_LABEL),
                    })
                  }
                  placeholder="Label (e.g. Instagram)"
                  className={INPUT}
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move link up"
                    className={ICON_BTN}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === links.length - 1}
                    aria-label="Move link down"
                    className={ICON_BTN}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLink(link.id)}
                    aria-label="Remove link"
                    className={ICON_BTN}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
              <input
                value={link.url}
                onChange={(e) => updateLink(link.id, { url: e.target.value })}
                placeholder="https://… or you@email.com"
                inputMode="url"
                className={INPUT}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={link.isActive}
                  onChange={(e) =>
                    updateLink(link.id, { isActive: e.target.checked })
                  }
                />
                Active
              </label>
            </div>
          ))}
        </div>

        {links.length < MAX_LINKS && (
          <button
            type="button"
            onClick={addLink}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add link
          </button>
        )}
      </section>

      {/* Booking policy */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Booking policy
            </h2>
            <p className="text-sm text-muted-foreground">
              Deposit, cancellation, minimum size, the work you take on. Shown
              on your public page.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="show_policy"
              checked={showPolicy}
              onChange={(e) => setShowPolicy(e.target.checked)}
            />
            Show
          </label>
        </div>
        <textarea
          name="booking_policy"
          rows={5}
          maxLength={MAX_BOOKING_POLICY}
          value={bookingPolicy}
          onChange={(e) => setBookingPolicy(e.target.value)}
          placeholder="e.g. A deposit holds your date. Deposits are non-refundable but carry to one reschedule with 48 hours notice."
          className={`${INPUT} resize-none`}
        />
        <p className="text-right text-xs text-muted-foreground">
          {bookingPolicy.length}/{MAX_BOOKING_POLICY}
        </p>
      </section>

      {/* Shop */}
      <section className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Shop</h2>
            <p className="text-sm text-muted-foreground">
              Your goods for appointment pickup. The Goods module ships next;
              this controls whether the shop section can show on your public
              page.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="show_shop"
              checked={showShop}
              onChange={(e) => setShowShop(e.target.checked)}
            />
            Show
          </label>
        </div>
      </section>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">
          {state.note ?? "Saved."}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save bio page"}
      </button>
    </form>
  );
}
