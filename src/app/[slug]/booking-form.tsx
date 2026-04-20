"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { submitBookingAction } from "./actions";
import { SIZES } from "@/lib/booking-schema";
import type { CustomFieldDef } from "@/lib/custom-fields";
import CustomFieldInput from "@/components/custom-field-input";

type State = { error: string; field?: string } | null;

const SIZE_LABELS: Record<
  (typeof SIZES)[number],
  { label: string; hint: string }
> = {
  "palm-sized": { label: "palm-sized", hint: "≈ 5cm" },
  "hand-sized": { label: "hand-sized", hint: "≈ 10cm" },
  forearm: { label: "forearm", hint: "≈ 15–20cm" },
  larger: { label: "larger", hint: "20cm+" },
};

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

type SlotOption = { id: string; date: string; time: string; tz: string };

export default function BookingForm({
  artistSlug,
  artistId,
  artistFirstName,
  bookingMode = "preferred_date",
  slots = [],
  customFields = [],
}: {
  artistSlug: string;
  artistId: string;
  artistFirstName: string;
  bookingMode?: string;
  slots?: SlotOption[];
  customFields?: CustomFieldDef[];
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    submitBookingAction,
    null,
  );

  const [description, setDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const toAdd = Array.from(incoming).slice(0, 5 - images.length);
    const newImages = [...images, ...toAdd].slice(0, 5);
    setImages(newImages);
    setPreviews(newImages.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("images");
    images.forEach((f) => fd.append("images", f));
    fd.set("artist_slug", artistSlug);
    startTransition(() => action(fd));
  };

  const err = (field: string) =>
    state && "field" in state && state.field === field ? state.error : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Global error */}
      {state?.error && !state.field && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      {/* Instagram */}
      <div className="space-y-1.5">
        <label
          htmlFor="instagram_handle"
          className="text-sm text-muted-foreground"
        >
          instagram handle <span className="text-foreground">*</span>
        </label>
        <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2.5 text-sm focus-within:ring-1 focus-within:ring-ring">
          <span className="text-muted-foreground select-none">@</span>
          <input
            id="instagram_handle"
            name="instagram_handle"
            type="text"
            required
            autoComplete="off"
            className="flex-1 bg-transparent text-foreground focus:outline-none"
          />
        </div>
        {err("instagram_handle") && (
          <p className="text-xs text-destructive">{err("instagram_handle")}</p>
        )}
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm text-muted-foreground">
          email <span className="text-foreground">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("email") && (
          <p className="text-xs text-destructive">{err("email")}</p>
        )}
      </div>

      {/* Reference link */}
      <div className="space-y-1.5">
        <label
          htmlFor="reference_link"
          className="text-sm text-muted-foreground"
        >
          reference link{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </label>
        <input
          id="reference_link"
          name="reference_link"
          type="url"
          placeholder="instagram.com/p/… or any link"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("reference_link") && (
          <p className="text-xs text-destructive">{err("reference_link")}</p>
        )}
      </div>

      {/* Placement */}
      <div className="space-y-1.5">
        <label htmlFor="placement" className="text-sm text-muted-foreground">
          placement <span className="text-foreground">*</span>
        </label>
        <input
          id="placement"
          name="placement"
          type="text"
          required
          placeholder="left forearm, inner wrist…"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("placement") && (
          <p className="text-xs text-destructive">{err("placement")}</p>
        )}
      </div>

      {/* Size */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          size <span className="text-foreground">*</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SIZES.map((s) => (
            <label
              key={s}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm cursor-pointer has-[:checked]:border-foreground has-[:checked]:text-foreground text-muted-foreground"
            >
              <input
                type="radio"
                name="size"
                value={s}
                required
                className="accent-foreground"
              />
              <span>
                {SIZE_LABELS[s].label}
                <span className="ml-1 text-xs text-muted-foreground">
                  {SIZE_LABELS[s].hint}
                </span>
              </span>
            </label>
          ))}
        </div>
        {err("size") && (
          <p className="text-xs text-destructive">{err("size")}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <label
            htmlFor="description"
            className="text-sm text-muted-foreground"
          >
            description <span className="text-foreground">*</span>
          </label>
          <span
            className={`text-xs ${description.length > 1000 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {description.length}/1000
          </span>
        </div>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={`tell me about the tattoo you have in mind — style, mood, any details that matter to you`}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        {err("description") && (
          <p className="text-xs text-destructive">{err("description")}</p>
        )}
      </div>

      {/* Custom fields */}
      {customFields.map((field) => (
        <CustomFieldInput
          key={field.id}
          field={field}
          error={err(`cf_${field.key}`)}
        />
      ))}

      {/* Image upload */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          reference images{" "}
          <span className="text-muted-foreground text-xs">
            (optional, max 5)
          </span>
        </p>

        {/* Drop zone */}
        {images.length < 5 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-md border border-dashed px-6 py-8 cursor-pointer transition-colors ${
              dragOver ? "border-foreground bg-muted/20" : "border-border"
            }`}
          >
            <p className="text-sm text-muted-foreground">
              drag images here or{" "}
              <span className="text-foreground underline underline-offset-4">
                browse
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              jpg, png, webp — max 10mb each
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        {/* Thumbnails */}
        {previews.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {previews.map((src, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-md overflow-hidden border border-border group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-lg"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Date / slot selection */}
      {bookingMode === "fixed_slots" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            select a slot <span className="text-foreground">*</span>
          </p>
          <div className="space-y-2">
            {slots.map((slot) => (
              <label
                key={slot.id}
                className="flex items-start gap-3 rounded-md border border-border px-3 py-3 cursor-pointer has-[:checked]:border-foreground"
              >
                <input
                  type="radio"
                  name="slot_id"
                  value={slot.id}
                  required
                  className="accent-foreground mt-0.5"
                />
                <div>
                  <p className="text-sm text-foreground">{slot.date}</p>
                  <p className="text-xs text-muted-foreground">
                    {slot.time} · {slot.tz}
                  </p>
                </div>
              </label>
            ))}
          </div>
          {err("slot_id") && (
            <p className="text-xs text-destructive">{err("slot_id")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <label
            htmlFor="preferred_date"
            className="text-sm text-muted-foreground"
          >
            preferred date <span className="text-foreground">*</span>
          </label>
          <input
            id="preferred_date"
            name="preferred_date"
            type="date"
            required
            min={tomorrow()}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {err("preferred_date") && (
            <p className="text-xs text-destructive">{err("preferred_date")}</p>
          )}
        </div>
      )}

      {/* Honeypot */}
      <input
        name="website"
        type="text"
        tabIndex={-1}
        className="hidden"
        aria-hidden
      />
      <input type="hidden" name="booking_mode" value={bookingMode} />
      <input type="hidden" name="artist_id" value={artistId} />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-foreground px-4 py-3 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "sending…" : `send request to ${artistFirstName}`}
      </button>

      <p className="text-xs text-muted-foreground text-center">
        by submitting you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          privacy policy
        </Link>
      </p>
    </form>
  );
}
