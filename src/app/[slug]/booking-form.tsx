"use client";

import BrandedDateInput from "@/components/public-booking/branded-date-input";
import { useActionState, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { submitBookingAction } from "./actions";
import { SIZES } from "@/lib/booking-schema";
import type { CustomFieldDef } from "@/lib/custom-fields";
import CustomFieldInput from "@/components/custom-field-input";
import type { FormSettings } from "@/lib/form-settings";
import {
  DEFAULT_FORM_SETTINGS,
  buildDefaultFieldOrder,
} from "@/lib/form-settings";
import type { Annotation } from "@/lib/annotations";
import AnnotationModal from "./annotation-modal";
import type { BookingMode } from "@/lib/booking-domain";
import { addDaysToDateKey, localDateKey } from "@/lib/date-utils";
import { HONEYPOT_FIELD } from "@/lib/honeypot";
import { compressImageInBrowser } from "@/lib/image-compress";
import { PublicBookingLegalNotice } from "@/components/public-booking/legal-notice";
import FieldArea, { CheckBadge } from "@/components/public-booking/field-area";

type State = { error: string; field?: string } | null;

export const SIZE_LABELS: Record<
  (typeof SIZES)[number],
  { label: string; hint: string }
> = {
  "palm-sized": { label: "Palm-sized", hint: "~ 5 cm" },
  "hand-sized": { label: "Hand-sized", hint: "~ 10 cm" },
  forearm: { label: "Forearm", hint: "~ 15-20 cm" },
  larger: { label: "Larger", hint: "20 cm+" },
};

const tomorrow = () => {
  return addDaysToDateKey(localDateKey(), 1);
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidUrl = (s: string) => {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
};

type SlotOption = {
  id: string;
  date: string;
  time: string;
  tz: string;
  location?: { label: string; tripTitle?: string };
};
type TripLeg = {
  startsOn: string;
  endsOn: string;
  locationLabel: string | null;
};
type TripOption = {
  id: string;
  title: string;
  description: string | null;
  legs: TripLeg[];
};

// Stable image entry — avoids index-based annotation tracking issues
type ImageEntry = { id: string; file: File; preview: string };

/**
 * For the chosen date, returns one entry per trip that has a leg spanning it,
 * carrying that leg's studio location label (null when the studio is hidden or
 * unset). Plain ISO string comparison (YYYY-MM-DD) avoids UTC offset issues.
 */
function locationsForDate(
  date: string,
  allTrips: TripOption[],
): { tripId: string; label: string | null }[] {
  if (!date) return [];
  // Collect EVERY leg spanning the date across all trips (not one per trip), so
  // overlapping guest spots — an artist working multiple studios at once — are
  // all surfaced rather than silently collapsed to the first match.
  const out: { tripId: string; label: string | null }[] = [];
  for (const t of allTrips) {
    for (const leg of t.legs) {
      if (leg.startsOn <= date && leg.endsOn >= date) {
        out.push({ tripId: t.id, label: leg.locationLabel });
      }
    }
  }
  return out;
}

export default function BookingForm({
  artistSlug,
  artistFirstName,
  bookingMode = "preferred_date",
  slots = [],
  customFields = [],
  formSettings = DEFAULT_FORM_SETTINGS,
  fieldOrder,
  trips = [],
  isDemoAccount = false,
  studioId = null,
}: {
  artistSlug: string;
  artistFirstName: string;
  bookingMode?: BookingMode;
  slots?: SlotOption[];
  customFields?: CustomFieldDef[];
  formSettings?: FormSettings;
  fieldOrder?: string[];
  trips?: TripOption[];
  isDemoAccount?: boolean;
  studioId?: string | null;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    submitBookingAction,
    null,
  );

  const [demoBlocked, setDemoBlocked] = useState(false);
  const [preferredDate, setPreferredDate] = useState("");
  const [description, setDescription] = useState("");
  const [legalExpanded, setLegalExpanded] = useState(false);

  // Controlled values backing the in-field completion checkmarks.
  const [igVal, setIgVal] = useState("");
  const [emailVal, setEmailVal] = useState("");
  const [placementVal, setPlacementVal] = useState("");
  const [refVal, setRefVal] = useState("");

  // Image management — stable IDs decouple annotation tracking from array order
  const [imageEntries, setImageEntries] = useState<ImageEntry[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Annotation state — keyed by imageEntry.id
  const [annotationMap, setAnnotationMap] = useState<
    Record<string, Annotation[]>
  >({});
  const [annotatingId, setAnnotatingId] = useState<string | null>(null);

  const MAX_FILES = 5;
  const MAX_SIZE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const annotationsEnabled =
    formSettings.show_image_upload && formSettings.allow_photo_annotations;

  function addFiles(incoming: FileList | null) {
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

    const slots = MAX_FILES - imageEntries.length;
    if (valid.length > slots) {
      errors.push(
        `Only ${slots} more image${slots === 1 ? "" : "s"} can be added (max ${MAX_FILES} total)`,
      );
    }

    const newEntries: ImageEntry[] = valid
      .slice(0, Math.max(0, slots))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      }));

    setImageEntries((prev) => [...prev, ...newEntries]);
    setUploadErrors(errors);

    // Auto-open annotation modal for the first newly added photo
    if (annotationsEnabled && newEntries.length > 0) {
      setAnnotatingId(newEntries[0].id);
    }
  }

  function removeImage(entryId: string) {
    setImageEntries((prev) => prev.filter((e) => e.id !== entryId));
    setAnnotationMap((prev) => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
    setUploadErrors([]);
    if (annotatingId === entryId) setAnnotatingId(null);
  }

  function handleAnnotationSave(entryId: string, annotations: Annotation[]) {
    setAnnotationMap((prev) => ({ ...prev, [entryId]: annotations }));
    setAnnotatingId(null);
  }

  const [compressing, setCompressing] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isDemoAccount) {
      setDemoBlocked(true);
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.delete("images");
    fd.set("artist_slug", artistSlug);

    // Compress images in the browser before upload — Vercel Hobby caps the
    // total request body at ~4.5 MB, which a couple of phone photos easily
    // exceed. The server still re-processes via sharp() to enforce final
    // dimensions and produce the canonical WebP.
    let attachments = imageEntries.map((entry) => entry.file);
    if (attachments.length > 0) {
      setCompressing(true);
      try {
        attachments = await Promise.all(
          imageEntries.map((entry) => compressImageInBrowser(entry.file)),
        );
      } finally {
        setCompressing(false);
      }
    }
    attachments.forEach((file) => fd.append("images", file));

    // Serialize annotations as a parallel array (same order as images).
    // Coordinates are 0–1 normalized so compression does not displace pins.
    if (annotationsEnabled) {
      const annotationsPayload = imageEntries.map(
        (entry) => annotationMap[entry.id] ?? [],
      );
      fd.set("annotations_json", JSON.stringify(annotationsPayload));
    }
    startTransition(() => action(fd));
  };

  const err = (field: string) =>
    state && "field" in state && state.field === field ? state.error : null;

  // Location availability — derived from selected date
  const hasTrips = trips.length > 0;
  // Instagram and email are each optional when BOTH are offered — one is enough,
  // so clients without Instagram aren't excluded. When only one field is shown,
  // that one stays required.
  const bothContactShown =
    formSettings.show_instagram_handle && formSettings.show_email;

  // Per-control completion — drives the in-field checkmarks.
  const igDone = igVal.trim() !== "";
  const emailDone = EMAIL_RE.test(emailVal.trim());
  const placementDone = placementVal.trim() !== "";
  const refDone = refVal.trim() !== "" && isValidUrl(refVal.trim());
  const descDone = description.trim() !== "" && description.length <= 1000;
  const validLocations = locationsForDate(preferredDate, trips);
  // Distinct, named studios for the chosen date. When more than one leg covers
  // the date (an artist at multiple studios at once) we show them all and tell
  // the client the artist will confirm — never make the client guess.
  const distinctLocationLabels = [
    ...new Set(
      validLocations.map((l) => l.label).filter((x): x is string => !!x),
    ),
  ];

  const annotatingEntry = annotatingId
    ? (imageEntries.find((e) => e.id === annotatingId) ?? null)
    : null;

  const resolvedFieldOrder =
    fieldOrder ?? buildDefaultFieldOrder(customFields.map((f) => f.id));

  function renderField(key: string) {
    switch (key) {
      case "instagram_handle":
        // When BOTH contact methods are offered, render them together as one
        // "Your contact" area (Instagram left, email right) with completion
        // feedback. Falls through to a standalone field when only one is shown.
        if (bothContactShown) {
          return (
            <div className="space-y-2">
              <label className="text-base text-muted-foreground">
                Your contact <span className="text-foreground">*</span>
              </label>
              <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div className="flex items-center gap-2 rounded-md border border-border bg-transparent px-3 py-2.5 text-sm focus-within:ring-1 focus-within:ring-ring">
                  <span className="select-none text-muted-foreground">@</span>
                  <input
                    id="instagram_handle"
                    name="instagram_handle"
                    type="text"
                    autoComplete="off"
                    placeholder="instagram"
                    value={igVal}
                    onChange={(e) => setIgVal(e.target.value)}
                    className="flex-1 bg-transparent text-foreground focus:outline-none border-0 outline-none shadow-none p-0"
                  />
                  {igDone && <CheckBadge />}
                </div>
                <span className="text-center text-sm font-medium text-muted-foreground">
                  or
                </span>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="email"
                    value={emailVal}
                    onChange={(e) => setEmailVal(e.target.value)}
                    className="w-full rounded-md border border-border bg-transparent py-2.5 pl-3 pr-10 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  {emailDone && (
                    <CheckBadge className="absolute right-2.5 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>
              {(err("instagram_handle") || err("email")) && (
                <p className="text-sm text-destructive">
                  {err("instagram_handle") ?? err("email")}
                </p>
              )}
            </div>
          );
        }
        return formSettings.show_instagram_handle ? (
          <div className="space-y-1.5">
            <label
              htmlFor="instagram_handle"
              className="text-base text-muted-foreground"
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
                className="flex-1 bg-transparent text-foreground focus:outline-none border-0 outline-none shadow-none p-0"
              />
            </div>
            {err("instagram_handle") && (
              <p className="text-sm text-destructive">
                {err("instagram_handle")}
              </p>
            )}
          </div>
        ) : null;

      case "email":
        // Rendered inside the combined "Your contact" area above when both
        // methods are shown; standalone only when it's the sole contact field.
        if (bothContactShown) return null;
        return formSettings.show_email ? (
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-base text-muted-foreground">
              Email <span className="text-foreground">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-border bg-transparent px-3 py-3 text-base text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {err("email") && (
              <p className="text-sm text-destructive">{err("email")}</p>
            )}
          </div>
        ) : null;

      case "reference_link":
        return formSettings.show_reference_link ? (
          <div className="space-y-1.5">
            <label
              htmlFor="reference_link"
              className="text-base text-muted-foreground"
            >
              Reference link{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <div className="relative">
              <input
                id="reference_link"
                name="reference_link"
                type="url"
                placeholder="instagram.com/p/... or any link"
                value={refVal}
                onChange={(e) => setRefVal(e.target.value)}
                className="w-full rounded-md border border-border bg-transparent py-3 pl-3 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {refDone && (
                <CheckBadge className="absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>
            {err("reference_link") && (
              <p className="text-sm text-destructive">
                {err("reference_link")}
              </p>
            )}
          </div>
        ) : null;

      case "placement":
        return formSettings.show_placement ? (
          <div className="space-y-1.5">
            <label
              htmlFor="placement"
              className="text-base text-muted-foreground"
            >
              Placement <span className="text-foreground">*</span>
            </label>
            <div className="relative">
              <input
                id="placement"
                name="placement"
                type="text"
                required
                placeholder="Left forearm, inner wrist..."
                value={placementVal}
                onChange={(e) => setPlacementVal(e.target.value)}
                className="w-full rounded-md border border-border bg-transparent py-3 pl-3 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {placementDone && (
                <CheckBadge className="absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>
            {err("placement") && (
              <p className="text-sm text-destructive">{err("placement")}</p>
            )}
          </div>
        ) : null;

      case "size":
        return formSettings.show_size ? (
          <div className="space-y-2">
            <p className="text-base text-muted-foreground">
              Size <span className="text-foreground">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SIZES.map((s) => (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-3 text-base text-muted-foreground has-[:checked]:border-foreground has-[:checked]:text-foreground"
                >
                  <input
                    type="radio"
                    name="size"
                    value={s}
                    required
                    className="peer accent-foreground"
                  />
                  <span className="inline-flex items-baseline gap-1.5">
                    <span>{SIZE_LABELS[s].label}</span>
                    <span className="text-xs text-muted-foreground">
                      · {SIZE_LABELS[s].hint}
                    </span>
                  </span>
                  <span className="ml-auto opacity-0 transition-opacity peer-checked:opacity-100">
                    <CheckBadge />
                  </span>
                </label>
              ))}
            </div>
            {err("size") && (
              <p className="text-sm text-destructive">{err("size")}</p>
            )}
          </div>
        ) : null;

      case "description":
        return (
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label
                htmlFor="description"
                className="text-base text-muted-foreground"
              >
                Description{" "}
                {formSettings.require_description ? (
                  <span className="text-foreground">*</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    (optional)
                  </span>
                )}
              </label>
              <span
                className={`text-xs ${description.length > 1000 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {description.length}/1000
              </span>
            </div>
            <div className="relative">
              <textarea
                id="description"
                name="description"
                required={formSettings.require_description}
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell me about the tattoo you have in mind - style, mood, any details that matter to you."
                className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {descDone && <CheckBadge className="absolute bottom-4 right-3" />}
            </div>
            {err("description") && (
              <p className="text-sm text-destructive">{err("description")}</p>
            )}
          </div>
        );

      case "image_upload":
        return formSettings.show_image_upload ? (
          <div className="space-y-2">
            <div>
              <p className="text-base text-muted-foreground">
                Reference images{" "}
                <span className="text-xs text-muted-foreground">
                  (optional)
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Up to 5 files. JPG, PNG, or WebP, max 10 MB each.
                {annotationsEnabled &&
                  " You can add notes to photos after uploading."}
              </p>
            </div>

            {imageEntries.length < MAX_FILES && (
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
                  <p className="text-base text-muted-foreground">
                    Drag images here or{" "}
                    <span className="text-foreground underline underline-offset-4">
                      browse
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {imageEntries.length > 0
                      ? `${imageEntries.length} of ${MAX_FILES} added · ${MAX_FILES - imageEntries.length} more allowed`
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
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 space-y-1"
              >
                <p className="text-sm font-medium text-destructive">
                  {uploadErrors.length === 1
                    ? "1 file couldn't be added"
                    : `${uploadErrors.length} files couldn't be added`}
                </p>
                <ul className="space-y-0.5">
                  {uploadErrors.map((msg, i) => (
                    <li key={i} className="text-xs text-destructive/90">
                      {msg}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {imageEntries.length > 0 && (
              <div className="grid grid-cols-5 gap-2">
                {imageEntries.map((entry) => {
                  const entryAnnotations = annotationMap[entry.id] ?? [];
                  return (
                    <div
                      key={entry.id}
                      className="group relative aspect-square overflow-hidden rounded-md border border-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.preview}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {annotationsEnabled && (
                        <button
                          type="button"
                          onClick={() => setAnnotatingId(entry.id)}
                          className="absolute top-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-white text-xs leading-none hover:bg-black/80 transition-colors"
                          title={
                            entryAnnotations.length > 0
                              ? `${entryAnnotations.length} note${entryAnnotations.length > 1 ? "s" : ""} · click to edit`
                              : "Add notes"
                          }
                        >
                          {entryAnnotations.length > 0
                            ? `${entryAnnotations.length} ✎`
                            : "+ note"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(entry.id)}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null;

      case "preferred_date":
        return (
          <>
            {bookingMode === "fixed_slots" ? (
              <div className="space-y-2">
                <p className="text-base text-muted-foreground">
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
                        {slot.location && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {slot.location.tripTitle ? (
                              <>
                                <span className="text-foreground">
                                  {slot.location.label}
                                </span>
                                <span> · {slot.location.tripTitle}</span>
                              </>
                            ) : (
                              <span className="text-foreground">
                                {slot.location.label}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                {err("slot_id") && (
                  <p className="text-sm text-destructive">{err("slot_id")}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <label
                  htmlFor="preferred_date"
                  className="text-base text-muted-foreground"
                >
                  Preferred date <span className="text-foreground">*</span>
                </label>
                <BrandedDateInput
                  id="preferred_date"
                  name="preferred_date"
                  required
                  min={tomorrow()}
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                />
                {err("preferred_date") && (
                  <p className="text-sm text-destructive">
                    {err("preferred_date")}
                  </p>
                )}
              </div>
            )}

            {/* Location — preferred_date mode only, reactive to the chosen */}
            {/* date. Shows the studio of the trip stop matching the date. When */}
            {/* no guest spot covers the date, nothing renders (avoids exposing */}
            {/* home-studio / guest-spot internals to the customer). */}
            {bookingMode !== "fixed_slots" &&
              hasTrips &&
              preferredDate &&
              validLocations.length > 0 &&
              (validLocations.length === 1 ? (
                <>
                  <input
                    type="hidden"
                    name="trip_id"
                    value={validLocations[0].tripId}
                  />
                  {validLocations[0].label && (
                    <p className="text-base text-muted-foreground">
                      Location:{" "}
                      <span className="text-foreground">
                        {validLocations[0].label}
                      </span>
                    </p>
                  )}
                </>
              ) : (
                // Overlapping guest spots: the artist is at more than one
                // studio on this date. Show both and let the client know the
                // artist will confirm the exact studio — no trip_id submitted
                // since which studio applies is genuinely undecided here.
                <div className="space-y-1.5">
                  {distinctLocationLabels.length > 0 && (
                    <p className="text-base text-muted-foreground">
                      Possible locations:{" "}
                      <span className="text-foreground">
                        {distinctLocationLabels.join(" · ")}
                      </span>
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {artistFirstName} is working from more than one studio on
                    this date and will confirm where your appointment will be.
                  </p>
                </div>
              ))}
          </>
        );

      default: {
        // Custom field — look up by UUID in the active customFields list
        const cf = customFields.find((f) => f.id === key);
        return cf ? (
          <CustomFieldInput field={cf} error={err(`cf_${cf.key}`)} />
        ) : null;
      }
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-8">
        {state?.error && !state.field && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        {resolvedFieldOrder.map((key) => {
          const node = renderField(key);
          if (!node) return null;
          // The image dropzone is optional + interactive (opens the annotation
          // modal), so it's exempt from the auto-confirm + scroll behavior.
          if (key === "image_upload") return <div key={key}>{node}</div>;
          return (
            <FieldArea key={key} gap={32}>
              {node}
            </FieldArea>
          );
        })}

        <input
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="sr-only"
        />
        {studioId && <input type="hidden" name="studio_id" value={studioId} />}
        {demoBlocked && (
          <div className="rounded-md border border-brand-mustard/30 bg-brand-mustard/5 px-4 py-3 space-y-1">
            <p className="text-sm font-medium text-foreground">
              Demo account · for illustration only
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              This page is a live example showing how Inklee works. It&apos;s
              dedicated to Bert Grimm (1900–1985), one of the most influential
              tattoo artists of the 20th century. Please don&apos;t submit real
              booking requests here.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground">
            You&apos;ll get a confirmation email with a link to edit or cancel
            before {artistFirstName} replies.
          </p>
          <button
            type="submit"
            disabled={pending || compressing}
            className="w-full rounded-full bg-brand-mustard px-5 py-3 text-base font-medium text-brand-charcoal disabled:opacity-50"
          >
            {compressing
              ? "Preparing photos..."
              : pending
                ? "Sending..."
                : `Send request to ${artistFirstName}`}
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          By submitting, you agree to our{" "}
          <Link
            href="/terms"
            className="hover:underline hover:underline-offset-4"
          >
            Terms
          </Link>
          ,{" "}
          <Link
            href="/privacy"
            className="hover:underline hover:underline-offset-4"
          >
            Privacy Policy
          </Link>
          , and{" "}
          <Link
            href="/acceptable-use"
            className="hover:underline hover:underline-offset-4"
          >
            Acceptable Use Policy
          </Link>
          .{" "}
          <button
            type="button"
            onClick={() => setLegalExpanded((v) => !v)}
            aria-expanded={legalExpanded}
            aria-controls="public-booking-legal-notice"
            className="align-baseline text-xs underline underline-offset-4"
          >
            {legalExpanded ? "Show less" : "Learn more"}
          </button>
        </p>

        {legalExpanded && <PublicBookingLegalNotice />}
      </form>

      {/* Annotation modal — rendered outside the form to avoid nested form issues */}
      {annotationsEnabled && annotatingEntry && (
        <AnnotationModal
          imagePreview={annotatingEntry.preview}
          initialAnnotations={annotationMap[annotatingEntry.id] ?? []}
          onSave={(annotations) =>
            handleAnnotationSave(annotatingEntry.id, annotations)
          }
          onClose={() => setAnnotatingId(null)}
        />
      )}
    </>
  );
}
