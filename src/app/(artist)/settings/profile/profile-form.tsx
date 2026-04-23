"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Spinner from "@/components/spinner";
import SlotsPromptModal from "@/components/slots-prompt-modal";
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
  booking_mode: string | null;
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
  const [bookingMode, setBookingMode] = useState(
    profile?.booking_mode ?? "preferred_date",
  );
  const [showSlotsModal, setShowSlotsModal] = useState(false);
  const [slotsWarningDismissed, setSlotsWarningDismissed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <form action={action} className="space-y-5">
        {state && "error" in state && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state && "success" in state && (
          <p className="text-sm text-green-500">Profile updated.</p>
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

        <div className="space-y-1.5">
          <label
            htmlFor="display_name"
            className="text-sm text-muted-foreground"
          >
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

        <div className="space-y-1.5">
          <label
            htmlFor="booking_mode"
            className="text-sm text-muted-foreground"
          >
            Booking mode
          </label>
          <select
            id="booking_mode"
            name="booking_mode"
            value={bookingMode}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "fixed_slots") {
                setBookingMode("fixed_slots");
                setShowSlotsModal(true);
              } else {
                setBookingMode(next);
                setSlotsWarningDismissed(false);
              }
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="preferred_date">
              Preferred date — client suggests a date
            </option>
            <option value="fixed_slots">
              Fixed slots — you publish specific time slots
            </option>
          </select>

          {bookingMode === "fixed_slots" && slotsWarningDismissed && (
            <div className="rounded-md border border-orange-400/40 bg-orange-400/5 px-3 py-2.5 flex items-start gap-2">
              <span className="text-orange-400 text-sm shrink-0 mt-px">⚠</span>
              <p className="text-xs text-orange-400 leading-relaxed">
                Books will be closed until you{" "}
                <Link
                  href="/bookings/slots"
                  className="underline underline-offset-4 hover:opacity-80"
                >
                  publish slots
                </Link>
                .
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Save profile"}
        </button>
      </form>

      {showSlotsModal && (
        <SlotsPromptModal
          onSkip={() => {
            setShowSlotsModal(false);
            setSlotsWarningDismissed(true);
          }}
          onCancel={() => {
            setShowSlotsModal(false);
            setBookingMode("preferred_date");
          }}
        />
      )}
    </>
  );
}
