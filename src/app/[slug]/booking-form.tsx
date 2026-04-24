"use client";

import DateInput from "@/components/date-input";
import { useActionState, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { submitBookingAction } from "./actions";
import { SIZES } from "@/lib/booking-schema";
import type { CustomFieldDef } from "@/lib/custom-fields";
import CustomFieldInput from "@/components/custom-field-input";
import type { FormSettings } from "@/lib/form-settings";
import { DEFAULT_FORM_SETTINGS } from "@/lib/form-settings";

type State = { error: string; field?: string } | null;

const SIZE_LABELS: Record<
  (typeof SIZES)[number],
  { label: string; hint: string }
> = {
  "palm-sized": { label: "Palm-sized", hint: "~ 5 cm" },
  "hand-sized": { label: "Hand-sized", hint: "~ 10 cm" },
  forearm: { label: "Forearm", hint: "~ 15-20 cm" },
  larger: { label: "Larger", hint: "20 cm+" },
};

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

type SlotOption = { id: string; date: string; time: string; tz: string };
type TripOption = { id: string; title: string; description: string | null };

export default function BookingForm({
  artistSlug,
  artistFirstName,
  bookingMode = "preferred_date",
  slots = [],
  customFields = [],
  formSettings = DEFAULT_FORM_SETTINGS,
  travelLegId = null,
  trips = [],
}: {
  artistSlug: string;
  artistFirstName: string;
  bookingMode?: string;
  slots?: SlotOption[];
  customFields?: CustomFieldDef[];
  formSettings?: FormSettings;
  travelLegId?: string | null;
  trips?: TripOption[];
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    submitBookingAction,
    null,
  );

  const [description, setDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILES = 5;
  const MAX_SIZE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const errors: string[] = [];
    const valid: File[] = [];

    Array.from(incoming).forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`${file.name}: unsupported format (JPG, PNG, WebP only)`);
      } else if (file.size > MAX_SIZE_BYTES) {
        errors.push(`${file.name}: too large (max 10 MB per file)`);
      } else {
        valid.push(file);
      }
    });

    const slots = MAX_FILES - images.length;
    if (valid.length > slots) {
      errors.push(
        `Only ${slots} more image${slots === 1 ? "" : "s"} can be added (max ${MAX_FILES} total)`,
      );
    }

    const newImages = [...images, ...valid].slice(0, MAX_FILES);
    setImages(newImages);
    setPreviews(newImages.map((f) => URL.createObjectURL(f)));
    setUploadErrors(errors);
  };

  const removeImage = (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
    setUploadErrors([]);
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
      {state?.error && !state.field && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="instagram_handle"
          className="text-sm text-muted-foreground"
        >
          Instagram handle <span className="text-foreground">*</span>
        </label>
        <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2.5 text-sm focus-within:ring-1 focus-within:ring-ring">
          <span className="select-none text-muted-foreground">@</span>
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

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm text-muted-foreground">
          Email <span className="text-foreground">*</span>
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

      {formSettings.show_reference_link && (
        <div className="space-y-1.5">
          <label
            htmlFor="reference_link"
            className="text-sm text-muted-foreground"
          >
            Reference link{" "}
            <span className="text-xs text-muted-foreground">(optional)</span>
          </label>
          <input
            id="reference_link"
            name="reference_link"
            type="url"
            placeholder="instagram.com/p/... or any link"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {err("reference_link") && (
            <p className="text-xs text-destructive">{err("reference_link")}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="placement" className="text-sm text-muted-foreground">
          Placement <span className="text-foreground">*</span>
        </label>
        <input
          id="placement"
          name="placement"
          type="text"
          required
          placeholder="Left forearm, inner wrist..."
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("placement") && (
          <p className="text-xs text-destructive">{err("placement")}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Size <span className="text-foreground">*</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SIZES.map((s) => (
            <label
              key={s}
              className="cursor-pointer rounded-md border border-border px-3 py-2.5 text-sm text-muted-foreground has-[:checked]:border-foreground has-[:checked]:text-foreground"
            >
              <div className="flex items-center gap-2.5">
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
              </div>
            </label>
          ))}
        </div>
        {err("size") && (
          <p className="text-xs text-destructive">{err("size")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between">
          <label
            htmlFor="description"
            className="text-sm text-muted-foreground"
          >
            Description{" "}
            {formSettings.require_description ? (
              <span className="text-foreground">*</span>
            ) : (
              <span className="text-xs text-muted-foreground">(optional)</span>
            )}
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
          required={formSettings.require_description}
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell me about the tattoo you have in mind - style, mood, any details that matter to you."
          className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("description") && (
          <p className="text-xs text-destructive">{err("description")}</p>
        )}
      </div>

      {customFields.map((field) => (
        <CustomFieldInput
          key={field.id}
          field={field}
          error={err(`cf_${field.key}`)}
        />
      ))}

      {formSettings.show_image_upload && (
        <div className="space-y-2">
          <div>
            <p className="text-sm text-muted-foreground">
              Reference images{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Up to 5 files — JPG, PNG, or WebP — max 10 MB each. Large images
              are automatically optimised before upload.
            </p>
          </div>

          {images.length < MAX_FILES && (
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
              className={`cursor-pointer rounded-md border border-dashed px-6 py-8 transition-colors ${
                dragOver ? "border-foreground bg-muted/20" : "border-border"
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-1">
                <p className="text-sm text-muted-foreground">
                  Drag images here or{" "}
                  <span className="text-foreground underline underline-offset-4">
                    browse
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {images.length > 0
                    ? `${images.length} of ${MAX_FILES} added — ${MAX_FILES - images.length} more allowed`
                    : `Up to ${MAX_FILES} images`}
                </p>
              </div>
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

          {uploadErrors.length > 0 && (
            <ul className="space-y-1">
              {uploadErrors.map((msg, i) => (
                <li key={i} className="text-xs text-destructive">
                  {msg}
                </li>
              ))}
            </ul>
          )}

          {previews.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {previews.map((src, i) => (
                <div
                  key={i}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {bookingMode === "fixed_slots" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Select a slot <span className="text-foreground">*</span>
          </p>
          <div className="space-y-2">
            {slots.map((slot) => (
              <label
                key={slot.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-3 has-[:checked]:border-foreground"
              >
                <input
                  type="radio"
                  name="slot_id"
                  value={slot.id}
                  required
                  className="mt-0.5 accent-foreground"
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
            Preferred date <span className="text-foreground">*</span>
          </label>
          <DateInput
            id="preferred_date"
            name="preferred_date"
            required
            min={tomorrow()}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {err("preferred_date") && (
            <p className="text-xs text-destructive">{err("preferred_date")}</p>
          )}
        </div>
      )}

      <input
        name="website"
        type="text"
        tabIndex={-1}
        className="hidden"
        aria-hidden
      />
      <input type="hidden" name="booking_mode" value={bookingMode} />
      {travelLegId && (
        <input type="hidden" name="travel_leg_id" value={travelLegId} />
      )}

      {trips.length > 0 && (
        <div className="space-y-1.5">
          <label htmlFor="trip_id" className="text-sm text-muted-foreground">
            Trip / location
          </label>
          <select
            id="trip_id"
            name="trip_id"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">No specific trip</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          {trips.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Select a trip if you&apos;d like to book for a specific guest
              spot.
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-foreground px-4 py-3 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Sending..." : `Send request to ${artistFirstName}`}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        By submitting, you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
