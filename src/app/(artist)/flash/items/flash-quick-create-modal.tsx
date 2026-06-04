"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, ImagePlus, X } from "lucide-react";
import DateInput from "@/components/date-input";
import Spinner from "@/components/spinner";
import { prepareImageUpload, applyFileToInput } from "@/lib/image-compress";
import { createFlashItemAction } from "./actions";

type State = { error: string } | { success: true; id?: string } | null;

type FlashDay = { id: string; title: string; scheduled_on: string | null };

/**
 * Lightweight "+ New design" surface — replaces the old `/flash/items/new`
 * subpage (which had 12+ fields visible). Core idea: a big image up top,
 * optional title, optional price. Everything else lives behind a single
 * "More settings" disclosure so the default state stays clean.
 *
 * Stays on `/flash/items` — the action revalidates the items list so the
 * new tile appears as soon as the modal closes.
 */
// Parent is responsible for mounting this component conditionally
// (`{open && <FlashQuickCreateModal ... />}`) — each mount starts fresh,
// each unmount throws away the form state. That's why there's no `open`
// prop or manual reset effect here.
export default function FlashQuickCreateModal({
  onClose,
  flashDays,
}: {
  onClose: () => void;
  flashDays: FlashDay[];
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    createFlashItemAction,
    null,
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [priceType, setPriceType] = useState<"request" | "fixed" | "from">(
    "request",
  );
  const [bookingMode, setBookingMode] = useState<
    "unique" | "limited" | "repeatable"
  >("unique");
  const [isBookable, setIsBookable] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Close on success — the action's revalidatePath refreshes the tile list.
  useEffect(() => {
    if (state && "success" in state) {
      onClose();
    }
  }, [state, onClose]);

  // Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flash-quick-create-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <form
          action={formAction}
          className="flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2
              id="flash-quick-create-title"
              className="text-sm font-medium text-foreground"
            >
              New flash design
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {/* Image drop zone — the centrepiece. */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative block aspect-square w-full overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/20 transition-colors hover:border-foreground/40 hover:bg-muted/30 focus:outline-none focus-visible:border-foreground/60"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImagePlus className="h-8 w-8" strokeWidth={1.5} />
                  <span className="text-sm font-medium">Add image</span>
                  <span className="text-xs">
                    PNG, JPG or WebP. Large images are compressed.
                  </span>
                </div>
              )}
            </button>
            <input
              ref={fileRef}
              name="preview_image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const input = e.currentTarget;
                const f = input.files?.[0];
                if (!f) return;
                const result = await prepareImageUpload(f);
                if ("error" in result) {
                  setImageError(result.error);
                  input.value = "";
                  return;
                }
                setImageError(null);
                applyFileToInput(input, result.file);
                setPreviewUrl(URL.createObjectURL(result.file));
              }}
            />
            {imageError && (
              <p className="text-xs text-destructive">{imageError}</p>
            )}

            {/* Title — optional */}
            <div className="space-y-1.5">
              <label
                htmlFor="flash-quick-title"
                className="text-sm text-muted-foreground"
              >
                Title <span className="text-xs">(optional)</span>
              </label>
              <input
                id="flash-quick-title"
                name="title"
                type="text"
                placeholder="e.g. Traditional rose"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Price — optional */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Price <span className="text-xs">(optional)</span>
              </label>
              <div className="flex gap-2">
                <select
                  name="price_type"
                  value={priceType}
                  onChange={(e) =>
                    setPriceType(e.target.value as typeof priceType)
                  }
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="request">On request</option>
                  <option value="fixed">Fixed</option>
                  <option value="from">From</option>
                </select>
                {priceType !== "request" && (
                  <div className="flex flex-1 items-center gap-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
                    <span className="text-muted-foreground">€</span>
                    <input
                      name="price"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      className="flex-1 bg-transparent text-foreground focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* "More settings" — progressive disclosure for the long tail */}
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>More settings</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
              />
            </button>

            {moreOpen && (
              <div className="space-y-4 rounded-md border border-border bg-muted/10 p-4">
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">
                    Status
                  </label>
                  <select
                    name="status"
                    defaultValue="draft"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="draft">Draft — not visible publicly</option>
                    <option value="published">
                      Published — live on your flash page
                    </option>
                  </select>
                </div>

                <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                  <div>
                    <p className="text-sm text-foreground">
                      Accepting bookings
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Toggle off to pause bookings without archiving.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isBookable}
                    onClick={() => setIsBookable((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                      isBookable ? "bg-foreground" : "bg-border"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
                        isBookable ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <input
                    type="hidden"
                    name="is_bookable"
                    value={String(isBookable)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">
                    Booking availability
                  </label>
                  <select
                    name="booking_mode"
                    value={bookingMode}
                    onChange={(e) =>
                      setBookingMode(e.target.value as typeof bookingMode)
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="unique">
                      Unique — one booking closes this item
                    </option>
                    <option value="limited">Limited — set a max number</option>
                    <option value="repeatable">
                      Repeatable — always bookable
                    </option>
                  </select>
                  {bookingMode === "limited" && (
                    <input
                      name="max_bookings"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Maximum bookings (e.g. 3)"
                      required
                      className="mt-2 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">
                    Short description
                  </label>
                  <textarea
                    name="short_description"
                    rows={2}
                    placeholder="Brief description of this design…"
                    className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">
                    Instagram post URL
                  </label>
                  <input
                    name="instagram_post_url"
                    type="url"
                    placeholder="https://instagram.com/p/…"
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">
                      Size info
                    </label>
                    <input
                      name="size_info"
                      type="text"
                      placeholder="~8 cm"
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">
                      Placement
                    </label>
                    <input
                      name="placement_notes"
                      type="text"
                      placeholder="e.g. forearm"
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">
                      Available from
                    </label>
                    <DateInput
                      name="available_from"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">
                      Available until
                    </label>
                    <DateInput
                      name="available_until"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                {flashDays.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">
                      Flash day
                    </label>
                    <select
                      name="flash_day_id"
                      defaultValue=""
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">None</option>
                      {flashDays.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                          {d.scheduled_on ? ` — ${d.scheduled_on}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {state && "error" in state && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
            >
              {pending ? (
                <Spinner className="mx-auto h-4 w-4" />
              ) : (
                "Create design"
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
