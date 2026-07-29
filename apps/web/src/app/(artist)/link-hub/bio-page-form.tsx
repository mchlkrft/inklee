"use client";

import { useActionState, useState } from "react";
import { Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { saveBioPageAction } from "./actions";
import {
  MAX_HEADLINE,
  MAX_TEXT,
  MAX_LINK_LABEL,
  MAX_SOCIALS,
  BIO_SOCIAL_PLATFORMS,
  BIO_SOCIAL_META,
  BIO_BLOCK_TYPES,
  BIO_BLOCK_META,
  canAddBlock,
  isFeatureBlockType,
  type BioBlock,
  type BioBlockType,
  type BioSocial,
  type BioSocialPlatform,
  type BioPageSettings,
} from "@/lib/bio-page-settings";

type State =
  | { error: string }
  | { success: true; note?: string; settings: BioPageSettings }
  | null;

// Partial<BioBlock> over a discriminated union narrows to only the common keys
// (id, type), so patches use an explicit field-union of every block's fields.
type BlockPatch = Partial<{
  collectionId: string;
  text: string;
  label: string;
  url: string;
  isActive: boolean;
}>;

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const ICON_BTN =
  "rounded-md border border-border p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `block-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** What each feature block will show, so the artist knows what they added and
 *  why it may render nothing yet. */
const FEATURE_BLOCK_HINTS: Record<string, string> = {
  booking_form:
    "Shows your booking button. Replaces the default one at the top.",
  goods:
    "Shows your shop, with a few product images. Hidden while your shop is empty.",
  guest_spots:
    "Shows your upcoming guest spots. Hidden while you have none planned.",
  flash:
    "Shows how much flash is available. Hidden while you have none published.",
  books_status: "Shows whether your books are open or closed.",
};

function makeBlock(type: BioBlockType, firstCollectionId?: string): BioBlock {
  const id = newId();
  // Feature blocks (P2b) carry no content: presence and position are the whole
  // payload, so there is nothing to seed and nothing for the artist to fill in.
  if (isFeatureBlockType(type)) return { id, type };
  // A featured collection is seeded with a real one (P5d). A block added empty
  // would be dropped by the parser on save, so the artist would add it, save,
  // and find it gone.
  if (type === "featured_collection") {
    return {
      id,
      type: "featured_collection",
      collectionId: firstCollectionId ?? "",
    };
  }
  if (type === "link")
    return { id, type: "link", label: "", url: "", isActive: true };
  if (type === "headline") return { id, type: "headline", text: "" };
  return { id, type: "text", text: "" };
}

// The Link Hub editor owns the standalone link-in-bio page: a fixed social icon
// row plus an ORDERED, mixed list of blocks (headlines, texts, links) the artist
// arranges freely, up to 10 of each. Booking policy + shop are booking-page
// concerns and live in /bookings/settings, not here. The save action preserves
// those fields so editing the Hub never touches them.
export default function BioPageForm({
  bioPage,
  collections = [],
}: {
  bioPage: BioPageSettings;
  /** The artist's LIVE collections, for the featured-collection picker. */
  collections?: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveBioPageAction,
    null,
  );

  const [blocks, setBlocks] = useState<BioBlock[]>(bioPage.blocks);
  const [socials, setSocials] = useState<BioSocial[]>(bioPage.socials);

  // After a successful save, re-sync local state to the server-sanitized result
  // (normalized URLs, dropped/ capped items) so the editor matches what was
  // stored. React's "adjust state during render" pattern (no effect).
  const [appliedState, setAppliedState] = useState<State>(null);
  if (state !== appliedState) {
    setAppliedState(state);
    if (state && "success" in state) {
      setBlocks(state.settings.blocks);
      setSocials(state.settings.socials);
    }
  }

  const patchBlock = (id: string, patch: BlockPatch) =>
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? ({ ...b, ...patch } as BioBlock) : b)),
    );
  const removeBlock = (id: string) =>
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  const moveBlock = (index: number, dir: -1 | 1) =>
    setBlocks((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  /** The first collection not already featured, so adding a second block does
   *  not seed a duplicate the parser would then silently drop. */
  const nextFreeCollectionId = (current: BioBlock[]): string | undefined => {
    const used = new Set(
      current
        .filter((b) => b.type === "featured_collection")
        .map((b) => (b as { collectionId: string }).collectionId),
    );
    return collections.find((c) => !used.has(c.id))?.id;
  };

  const addBlock = (type: BioBlockType) =>
    setBlocks((prev) =>
      canAddBlock(prev, type)
        ? [...prev, makeBlock(type, nextFreeCollectionId(prev))]
        : prev,
    );

  const updateSocial = (index: number, patch: Partial<BioSocial>) =>
    setSocials((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  const removeSocial = (index: number) =>
    setSocials((prev) => prev.filter((_, i) => i !== index));
  const addSocial = () =>
    setSocials((prev) => {
      if (prev.length >= MAX_SOCIALS) return prev;
      const used = new Set(prev.map((s) => s.platform));
      const next =
        BIO_SOCIAL_PLATFORMS.find((p) => !used.has(p)) ??
        BIO_SOCIAL_PLATFORMS[0];
      return [...prev, { platform: next, url: "" }];
    });

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
      <input type="hidden" name="socials" value={JSON.stringify(socials)} />

      {/* Socials — fixed icon row, always rendered above the blocks. */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Socials</h2>
          <p className="text-sm text-muted-foreground">
            Your social profiles, shown as an icon row at the top of your Link
            Hub.
          </p>
        </div>

        <div className="space-y-2">
          {socials.length === 0 && (
            <p className="text-sm text-muted-foreground">No socials yet.</p>
          )}
          {socials.map((s, i) => {
            // Offer this row's own platform + platforms not taken by other rows,
            // so the user can't pick a duplicate the parser would silently drop.
            const takenByOthers = new Set(
              socials.filter((_, j) => j !== i).map((x) => x.platform),
            );
            return (
              <div key={i} className="flex gap-2">
                <select
                  value={s.platform}
                  onChange={(e) =>
                    updateSocial(i, {
                      platform: e.target.value as BioSocialPlatform,
                    })
                  }
                  aria-label="Platform"
                  className={`${INPUT} max-w-[9.5rem] shrink-0`}
                >
                  {BIO_SOCIAL_PLATFORMS.filter(
                    (p) => p === s.platform || !takenByOthers.has(p),
                  ).map((p) => (
                    <option key={p} value={p}>
                      {BIO_SOCIAL_META[p].label}
                    </option>
                  ))}
                </select>
                <input
                  value={s.url}
                  onChange={(e) => updateSocial(i, { url: e.target.value })}
                  placeholder={
                    s.platform === "email" ? "you@email.com" : "https://…"
                  }
                  inputMode="url"
                  className={INPUT}
                />
                <button
                  type="button"
                  onClick={() => removeSocial(i)}
                  aria-label="Remove social"
                  className={ICON_BTN}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>

        {socials.length < MAX_SOCIALS && (
          <button
            type="button"
            onClick={addSocial}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add social
          </button>
        )}
      </section>

      {/* Content blocks — one ordered, mixed list the artist arranges. */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Content</h2>
          <p className="text-sm text-muted-foreground">
            Add headlines, text, and links, then reorder with the arrows. Up to
            10 of each. This is the body of your Link Hub.
          </p>
        </div>

        <div className="space-y-2">
          {blocks.length === 0 && (
            <p className="text-sm text-muted-foreground">No content yet.</p>
          )}
          {blocks.map((block, i) => (
            <div
              key={block.id}
              className="space-y-2 rounded-md border border-border px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {BIO_BLOCK_META[block.type].label}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveBlock(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className={ICON_BTN}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(i, 1)}
                    disabled={i === blocks.length - 1}
                    aria-label="Move down"
                    className={ICON_BTN}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(block.id)}
                    aria-label="Remove"
                    className={ICON_BTN}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>

              {/* Feature blocks have nothing to fill in: they show the data
                  the artist already keeps elsewhere. Say so, so the card does
                  not read as a broken empty editor. */}
              {isFeatureBlockType(block.type) && (
                <p className="text-xs text-muted-foreground">
                  {FEATURE_BLOCK_HINTS[block.type]}
                </p>
              )}

              {block.type === "featured_collection" && (
                <>
                  {collections.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      You have no collections yet. Make one under Goods,
                      collections, and it will show up here.
                    </p>
                  ) : (
                    <select
                      value={block.collectionId}
                      aria-label="Collection to feature"
                      onChange={(e) =>
                        patchBlock(block.id, { collectionId: e.target.value })
                      }
                      className={INPUT}
                    >
                      {/* A block can name a collection that has since been
                          archived or deleted. Keeping that option present means
                          the picker shows the artist what is actually saved
                          rather than silently reassigning it to another
                          collection the moment they open the editor. */}
                      {!collections.some((c) => c.id === block.collectionId) &&
                        block.collectionId && (
                          <option value={block.collectionId}>
                            (No longer available)
                          </option>
                        )}
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Shows that collection with a few product images. Hidden
                    while it is empty, hidden, or archived.
                  </p>
                </>
              )}

              {block.type === "headline" && (
                <>
                  <input
                    value={block.text}
                    onChange={(e) =>
                      patchBlock(block.id, {
                        text: e.target.value.slice(0, MAX_HEADLINE),
                      })
                    }
                    placeholder="e.g. Fine-line tattoos in Berlin"
                    className={INPUT}
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {block.text.length}/{MAX_HEADLINE}
                  </p>
                </>
              )}

              {block.type === "text" && (
                <>
                  <textarea
                    value={block.text}
                    rows={4}
                    maxLength={MAX_TEXT}
                    onChange={(e) =>
                      patchBlock(block.id, { text: e.target.value })
                    }
                    placeholder="e.g. Booking a few custom pieces this season."
                    className={`${INPUT} resize-none`}
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {block.text.length}/{MAX_TEXT}
                  </p>
                </>
              )}

              {block.type === "link" && (
                <>
                  <input
                    value={block.label}
                    onChange={(e) =>
                      patchBlock(block.id, {
                        label: e.target.value.slice(0, MAX_LINK_LABEL),
                      })
                    }
                    placeholder="Label (e.g. Portfolio)"
                    className={INPUT}
                  />
                  <input
                    value={block.url}
                    onChange={(e) =>
                      patchBlock(block.id, { url: e.target.value })
                    }
                    placeholder="https://… or you@email.com"
                    inputMode="url"
                    className={INPUT}
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={block.isActive}
                      onChange={(e) =>
                        patchBlock(block.id, { isActive: e.target.checked })
                      }
                    />
                    Active
                  </label>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {BIO_BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addBlock(type)}
              // Featuring needs something to feature, and something NOT ALREADY
              // featured: seeding a duplicate would produce a block the parser
              // drops on save.
              disabled={
                !canAddBlock(blocks, type) ||
                (type === "featured_collection" &&
                  !nextFreeCollectionId(blocks))
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/30 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {BIO_BLOCK_META[type].addLabel}
            </button>
          ))}
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
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save Link Hub"}
      </button>
    </form>
  );
}
