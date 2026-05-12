"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import Spinner from "@/components/spinner";
import { updateProfileAction } from "./actions";

type State = { error: string } | { success: true } | null;

const TIMEZONES = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const COVER_COLORS = [
  { id: "mustard", hex: "#e9b22b", label: "Mustard" },
  { id: "rosa", hex: "#db88b9", label: "Rosa" },
  { id: "cobalt", hex: "#0b3d9f", label: "Cobalt" },
  { id: "red", hex: "#cf2e2c", label: "Red" },
  { id: "green", hex: "#105f2d", label: "Green" },
] as const;

type Profile = {
  display_name: string;
  instagram_handle: string | null;
  bio: string | null;
  timezone: string;
  location: string | null;
  logo_url: string | null;
  settings: Record<string, unknown> | null;
};

export default function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, action, pending] = useActionState<State, FormData>(
    updateProfileAction,
    null,
  );
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [preview, setPreview] = useState<string | null>(
    profile?.logo_url ?? null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const initialCoverImage =
    typeof profile?.settings?.cover_image_url === "string"
      ? (profile.settings.cover_image_url as string)
      : null;
  const initialCoverColor =
    typeof profile?.settings?.cover_color === "string"
      ? (profile.settings.cover_color as string)
      : "";

  const [coverPreview, setCoverPreview] = useState<string | null>(
    initialCoverImage,
  );
  const [removeCover, setRemoveCover] = useState(false);
  const [coverColor, setCoverColor] = useState<string>(initialCoverColor);
  const coverFileRef = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="space-y-5">
      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-brand-green">Profile updated.</p>
      )}

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Logo</label>
        <div className="flex items-center gap-4">
          {preview ? (
            <div className="relative h-16 w-16 rounded-full overflow-hidden border border-border">
              <Image src={preview} alt="logo" fill className="object-cover" />
            </div>
          ) : (
            <div className="h-16 w-16 rounded-full border border-border flex items-center justify-center text-muted-foreground text-xs">
              None
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Change
          </button>
          <input
            ref={fileRef}
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPreview(URL.createObjectURL(file));
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, or WebP - max 2 MB - resized to 512x512
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">
          Cover image
          <span className="ml-1.5 text-xs">(optional)</span>
        </label>
        <p className="text-xs text-muted-foreground">
          Shown behind your name on your public booking page. Falls back to your
          cover color or charcoal.
        </p>
        <div className="relative h-32 w-full overflow-hidden rounded-[16px] border border-border bg-brand-charcoal">
          {coverPreview && !removeCover && (
            <Image
              src={coverPreview}
              alt="cover preview"
              fill
              className="object-cover"
              sizes="(min-width: 768px) 600px, 100vw"
              unoptimized
            />
          )}
          {(!coverPreview || removeCover) && coverColor && (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundColor:
                  COVER_COLORS.find((c) => c.id === coverColor)?.hex ??
                  (coverColor.startsWith("#") ? coverColor : undefined),
              }}
            />
          )}
          <div className="relative z-10 flex h-full items-end justify-between p-3">
            <span className="rounded-full bg-brand-charcoal/60 px-2.5 py-1 text-xs font-medium text-brand-bone">
              Preview
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => coverFileRef.current?.click()}
                className="rounded-md bg-brand-bone px-3 py-1.5 text-xs font-medium text-brand-charcoal"
              >
                {coverPreview && !removeCover ? "Replace" : "Upload"}
              </button>
              {coverPreview && !removeCover && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveCover(true);
                    setCoverPreview(null);
                    if (coverFileRef.current) coverFileRef.current.value = "";
                  }}
                  className="rounded-md bg-brand-charcoal/60 px-3 py-1.5 text-xs font-medium text-brand-bone"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
        <input
          ref={coverFileRef}
          name="cover_image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setCoverPreview(URL.createObjectURL(file));
              setRemoveCover(false);
            }
          }}
        />
        {removeCover && (
          <input type="hidden" name="remove_cover_image" value="1" />
        )}
        <p className="text-xs text-muted-foreground">
          PNG, JPG, or WebP - max 5 MB - resized to 1600×600
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">
          Cover color
          <span className="ml-1.5 text-xs">(used when no image is set)</span>
        </label>
        <input type="hidden" name="cover_color" value={coverColor} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCoverColor("")}
            className={`flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors ${
              coverColor === ""
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground"
            }`}
          >
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full bg-brand-charcoal ring-1 ring-border"
            />
            None
          </button>
          {COVER_COLORS.map(({ id, hex, label }) => {
            const isActive = coverColor === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCoverColor(id)}
                aria-pressed={isActive}
                title={label}
                className={`flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-foreground text-background"
                    : "border border-border text-muted-foreground"
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-full ring-1 ring-foreground/15"
                  style={{ backgroundColor: hex }}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="display_name" className="text-sm text-muted-foreground">
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          defaultValue={profile?.display_name ?? ""}
          required
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="instagram_handle"
          className="text-sm text-muted-foreground"
        >
          Instagram handle
        </label>
        <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
          <span className="text-muted-foreground select-none">@</span>
          <input
            id="instagram_handle"
            name="instagram_handle"
            type="text"
            defaultValue={profile?.instagram_handle ?? ""}
            className="flex-1 bg-transparent text-foreground focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between">
          <label htmlFor="bio" className="text-sm text-muted-foreground">
            Bio
          </label>
          <span
            className={`text-xs ${bio.length > 280 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {bio.length}/280
          </span>
        </div>
        <textarea
          id="bio"
          name="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="timezone" className="text-sm text-muted-foreground">
          Timezone
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={profile?.timezone ?? "Europe/Berlin"}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="location" className="text-sm text-muted-foreground">
          Location
        </label>
        <input
          id="location"
          name="location"
          type="text"
          defaultValue={profile?.location ?? ""}
          placeholder="City"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Save profile"}
      </button>
    </form>
  );
}
