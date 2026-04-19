"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
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

type Profile = {
  display_name: string;
  instagram_handle: string | null;
  bio: string | null;
  timezone: string;
  location: string | null;
  logo_url: string | null;
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

  return (
    <form action={action} className="space-y-5">
      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-green-500">profile updated</p>
      )}

      {/* Logo */}
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">logo</label>
        <div className="flex items-center gap-4">
          {preview ? (
            <div className="relative h-16 w-16 rounded-full overflow-hidden border border-border">
              <Image src={preview} alt="logo" fill className="object-cover" />
            </div>
          ) : (
            <div className="h-16 w-16 rounded-full border border-border flex items-center justify-center text-muted-foreground text-xs">
              none
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            change
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
          png, jpg, or webp — max 2mb — resized to 512×512
        </p>
      </div>

      {/* Display name */}
      <div className="space-y-1.5">
        <label htmlFor="display_name" className="text-sm text-muted-foreground">
          display name
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

      {/* Instagram */}
      <div className="space-y-1.5">
        <label
          htmlFor="instagram_handle"
          className="text-sm text-muted-foreground"
        >
          instagram handle
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

      {/* Bio */}
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <label htmlFor="bio" className="text-sm text-muted-foreground">
            bio
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

      {/* Timezone */}
      <div className="space-y-1.5">
        <label htmlFor="timezone" className="text-sm text-muted-foreground">
          timezone
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

      {/* Location */}
      <div className="space-y-1.5">
        <label htmlFor="location" className="text-sm text-muted-foreground">
          location
        </label>
        <input
          id="location"
          name="location"
          type="text"
          defaultValue={profile?.location ?? ""}
          placeholder="city"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "saving…" : "save profile"}
      </button>
    </form>
  );
}
