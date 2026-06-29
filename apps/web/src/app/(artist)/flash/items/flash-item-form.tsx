"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import DateInput from "@/components/date-input";
import Spinner from "@/components/spinner";
import { slugify } from "@/lib/flash";
import { CURRENCIES } from "@inklee/shared/goods";
import { prepareImageUpload, applyFileToInput } from "@/lib/image-compress";
import { createFlashItemAction, updateFlashItemAction } from "./actions";

type State = { error: string } | { success: true; id?: string } | null;

export type InitialValues = {
  id?: string;
  title?: string;
  slug?: string;
  status?: string;
  instagramPostUrl?: string | null;
  previewImageUrl?: string | null;
  shortDescription?: string | null;
  priceType?: string;
  price?: string | null;
  currency?: string | null;
  sizeInfo?: string | null;
  placementNotes?: string | null;
  bookingMode?: string;
  maxBookings?: number | null;
  isBookable?: boolean;
  availableFrom?: string | null;
  availableUntil?: string | null;
};

export default function FlashItemForm({
  initial = {},
  onSuccess,
}: {
  initial?: InitialValues;
  // When set (edit-in-modal), called after a successful save so the modal can
  // close. Without it (the standalone create/edit page) behaviour is unchanged.
  onSuccess?: () => void;
}) {
  const isEdit = !!initial.id;
  const router = useRouter();

  const action = isEdit ? updateFlashItemAction : createFlashItemAction;
  const [state, formAction, pending] = useActionState<State, FormData>(
    action,
    null,
  );

  // Edit-in-modal: close on a successful save (the update action revalidates
  // the grid, so the tile reflects the change).
  useEffect(() => {
    if (onSuccess && isEdit && state && "success" in state) onSuccess();
  }, [state, isEdit, onSuccess]);

  const [title, setTitle] = useState(initial.title ?? "");
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(!!initial.slug);
  const [bookingMode, setBookingMode] = useState(
    initial.bookingMode ?? "unique",
  );
  const [priceType, setPriceType] = useState(initial.priceType ?? "request");
  const [currency, setCurrency] = useState(initial.currency ?? "eur");
  const [isBookable, setIsBookable] = useState(initial.isBookable ?? true);
  const [previewUrl, setPreviewUrl] = useState(initial.previewImageUrl ?? "");
  const [imageError, setImageError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Redirect to edit page after successful create
  if (state && "success" in state && !isEdit && state.id) {
    router.push(`/flash/items/${state.id}`);
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  return (
    <form action={formAction} className="space-y-8 max-w-lg">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {/* Title + Slug */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Title</label>
          <input
            name="title"
            type="text"
            required
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. Traditional rose, small"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Slug{" "}
            <span className="text-sm font-normal text-muted-foreground">
              (used in the public URL)
            </span>
          </label>
          <input
            name="slug"
            type="text"
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            placeholder="traditional-rose-small"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Public URL: /[your-slug]/flash/
            <span className="text-foreground">{slug || "..."}</span>
          </p>
        </div>
      </div>

      {/* Status + Bookable */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Status</label>
          <select
            name="status"
            defaultValue={initial.status ?? "draft"}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="draft">Draft — not visible publicly</option>
            <option value="published">
              Published — live on your flash page
            </option>
            <option value="archived">Archived — hidden and closed</option>
          </select>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Accepting bookings
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
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
          <input type="hidden" name="is_bookable" value={String(isBookable)} />
        </div>
      </div>

      {/* Booking mode */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          Booking availability
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              {
                value: "unique",
                label: "Unique",
                desc: "One booking closes this item.",
              },
              {
                value: "limited",
                label: "Limited",
                desc: "Set a max number of bookings.",
              },
              {
                value: "repeatable",
                label: "Repeatable",
                desc: "Always bookable unless disabled.",
              },
            ] as const
          ).map((m) => {
            const active = bookingMode === m.value;
            return (
              <label
                key={m.value}
                className={`flex cursor-pointer flex-col gap-1 rounded-md border-2 px-3 py-3 transition-colors ${
                  active
                    ? "border-foreground bg-foreground/5"
                    : "border-border hover:border-foreground/40"
                }`}
              >
                <input
                  type="radio"
                  name="booking_mode"
                  value={m.value}
                  checked={active}
                  onChange={() => setBookingMode(m.value)}
                  className="sr-only"
                />
                <span
                  className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {m.label}
                </span>
                <span className="text-xs text-muted-foreground">{m.desc}</span>
              </label>
            );
          })}
        </div>

        {bookingMode === "limited" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Maximum bookings
            </label>
            <input
              name="max_bookings"
              type="number"
              min="1"
              step="1"
              defaultValue={initial.maxBookings ?? ""}
              required
              placeholder="e.g. 3"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Only confirmed (approved) bookings count against this limit.
              Pending requests do not consume capacity.
            </p>
          </div>
        )}
      </div>

      {/* Preview image */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          Preview image{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>

        {previewUrl && (
          <div className="relative w-32 h-32 rounded-md overflow-hidden border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            {previewUrl ? "Replace image" : "Upload image"}
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
          <p className="text-xs text-muted-foreground">
            PNG, JPG, or WebP. Large images are compressed automatically.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-muted-foreground">
            Or paste an image URL
          </label>
          <input
            name="preview_image_url"
            type="url"
            value={previewUrl}
            onChange={(e) => setPreviewUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Instagram post URL */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Instagram post URL{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          name="instagram_post_url"
          type="url"
          defaultValue={initial.instagramPostUrl ?? ""}
          placeholder="https://instagram.com/p/…"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Stored for reference and shown as a link on the public page.
        </p>
      </div>

      {/* Price */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Pricing</label>
        <select
          name="price_type"
          value={priceType}
          onChange={(e) => setPriceType(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="request">Price on request</option>
          <option value="fixed">Fixed price</option>
          <option value="from">Starting from</option>
        </select>
        {priceType !== "request" && (
          <div className="flex items-center gap-2">
            <select
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Currency"
              className="rounded-md border border-border bg-background px-2 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
            <input
              name="price"
              type="number"
              min="0"
              step="1"
              defaultValue={initial.price ?? ""}
              placeholder="0"
              className="flex-1 rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
      </div>

      {/* Secondary details, collapsed by default to keep the form short. */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>More details</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Kept mounted (hidden, not unmounted) when collapsed: the update action
            treats an absent field as null, so unmounting would wipe an existing
            item's description/size/placement/availability on a save that never
            opened this section. display:none inputs still submit. */}
        <div
          className={
            moreOpen
              ? "space-y-6 rounded-md border border-border bg-muted/10 p-4"
              : "hidden"
          }
        >
          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Short description{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <textarea
              name="short_description"
              rows={3}
              defaultValue={initial.shortDescription ?? ""}
              placeholder="Brief description of this flash design…"
              className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Size + Placement */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Size info{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <input
                name="size_info"
                type="text"
                defaultValue={initial.sizeInfo ?? ""}
                placeholder="e.g. approx. 8 cm"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Placement notes{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <input
                name="placement_notes"
                type="text"
                defaultValue={initial.placementNotes ?? ""}
                placeholder="e.g. works well on forearm"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Availability window */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Available from{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <DateInput
                name="available_from"
                defaultValue={initial.availableFrom ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Available until{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <DateInput
                name="available_until"
                defaultValue={initial.availableUntil ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && isEdit && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? (
            <Spinner className="mx-auto h-4 w-4" />
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Create flash item"
          )}
        </button>
        <Link
          href="/flash/items"
          className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
