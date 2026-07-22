"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MAP_LOCATION_CATEGORY_LABELS,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import {
  STUDIO_SIGNAL_LABELS,
  isStudioSignalType,
} from "@inklee/shared/studio-signals";
import {
  HOUSE_RULE_LABELS,
  type HouseRuleKey,
} from "@inklee/shared/studio-profile";
import { formatDateKey } from "@inklee/shared/date-utils";
import type { MapCapabilities } from "@inklee/shared/map-core-state";
import type { MapLocationDetail } from "@/lib/server/map-location-detail";

// The immersive in-canvas detail: the read essentials for a selected studio,
// fetched on demand from /api/map/locations/[id], so "View details" never
// leaves the map. Deeper actions (claim, request a guest spot, report) link out
// to the studio's own routes - the map initiates, it does not duplicate them.

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

export default function MapDetailPanel({
  pin,
  capabilities,
  watched,
  onToggleWatch,
  watchError,
  watchPending,
  onClose,
}: {
  pin: PublicMapPin;
  capabilities: MapCapabilities;
  watched: boolean;
  onToggleWatch: () => void;
  watchError: string | null;
  watchPending: boolean;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<MapLocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    // The shell keys this panel on pin.id, so it remounts per studio: loading
    // starts true and this effect only needs to resolve, not reset.
    const abort = new AbortController();
    fetch(`/api/map/locations/${pin.id}`, { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { detail: MapLocationDetail } | null) => {
        if (body?.detail) setDetail(body.detail);
        else setError(true);
        setLoading(false);
      })
      .catch(() => {
        // Aborted (a new selection) or offline: leave the last state.
      });
    return () => abort.abort();
  }, [pin.id]);

  const categoryLabel =
    MAP_LOCATION_CATEGORY_LABELS[pin.category] ?? pin.category;
  const place = detail
    ? [detail.address, detail.city, detail.country].filter(Boolean).join(", ")
    : "";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="false"
      aria-label={pin.name}
      tabIndex={-1}
      className="absolute inset-x-3 bottom-3 z-30 flex max-h-[72vh] flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-lg outline-none backdrop-blur md:inset-y-3 md:left-auto md:right-3 md:w-96 md:max-h-none"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {pin.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {categoryLabel}
            {detail?.claimed ? " · claimed" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="shrink-0 rounded-md px-1.5 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading details…</p>
        ) : error || !detail ? (
          <p className="text-sm text-muted-foreground">
            Could not load this place. Try the full page instead.
          </p>
        ) : (
          <>
            {detail.possiblyClosed ? (
              <div className="rounded-xl border border-brand-red/40 bg-brand-red/10 p-3">
                <p className="text-xs font-medium text-foreground">
                  Possibly closed
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Someone reported this studio may have closed. Details may be
                  out of date.
                </p>
              </div>
            ) : null}
            {detail.claimed && detail.lastConfirmedAt ? (
              <p className="text-xs text-muted-foreground">
                Confirmed by the studio on{" "}
                {formatDateKey(detail.lastConfirmedAt.slice(0, 10))}.
              </p>
            ) : null}
            {detail.unverified ? (
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-foreground">
                  Unverified listing. We compiled this from public map data, so
                  the details may be out of date.
                </p>
              </div>
            ) : null}

            {detail.signal && isStudioSignalType(detail.signal) ? (
              <div className="rounded-xl border border-brand-rosa/40 bg-brand-rosa/10 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Right now
                </p>
                <p className="text-sm font-medium text-foreground">
                  {STUDIO_SIGNAL_LABELS[detail.signal]}
                </p>
              </div>
            ) : null}

            {place ? (
              <Section title="Where">
                <p className="text-sm text-foreground">{place}</p>
              </Section>
            ) : null}
            {detail.openingHours ? (
              <Section title="Opening hours">
                <p className="text-sm text-foreground">{detail.openingHours}</p>
              </Section>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {detail.website ? (
                <a
                  href={detail.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
                >
                  Website
                </a>
              ) : null}
              {detail.instagram ? (
                <a
                  href={`https://instagram.com/${encodeURIComponent(detail.instagram)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
                >
                  @{detail.instagram}
                </a>
              ) : null}
              {detail.phone ? (
                <a
                  href={`tel:${detail.phone.replace(/[^\d+]/g, "")}`}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
                >
                  Call
                </a>
              ) : null}
              {capabilities.canWatch ? (
                <button
                  type="button"
                  disabled={watchPending}
                  onClick={onToggleWatch}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
                >
                  {watched ? "Watching ✓" : "Watch"}
                </button>
              ) : null}
            </div>
            {watchError ? (
              <p className="text-xs text-brand-red">{watchError}</p>
            ) : null}

            {detail.styles && !detail.styles.isEmpty ? (
              <Section title="Styles represented">
                {detail.styles.specialties.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {detail.styles.specialties.map((s) => (
                      <span
                        key={s.key}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                      >
                        {s.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                {detail.styles.guestStyles.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {detail.styles.guestStyles.map((s) => (
                      <span
                        key={s.key}
                        className="rounded-full bg-brand-rosa/15 px-2.5 py-1 text-xs text-foreground"
                      >
                        {s.label}
                        {s.showCount ? ` · ${s.count} visiting` : " · guest"}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="pt-1 text-xs text-muted-foreground">
                  Declared focus and visiting guest artists. Not every artist
                  works in every style.
                </p>
              </Section>
            ) : null}

            {detail.timeline &&
            (detail.timeline.current.length > 0 ||
              detail.timeline.upcoming.length > 0 ||
              detail.timeline.past.length > 0) ? (
              <Section title="Guest artists">
                <div className="space-y-2 pt-0.5">
                  {(
                    [
                      ["Now", detail.timeline.current],
                      ["Coming up", detail.timeline.upcoming],
                      ["Past", detail.timeline.past],
                    ] as const
                  )
                    .filter(([, entries]) => entries.length > 0)
                    .map(([heading, entries]) => (
                      <div key={heading} className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {heading}
                        </p>
                        <ul className="space-y-1">
                          {entries.map((entry, i) => (
                            <li
                              key={`${heading}-${i}`}
                              className="flex flex-wrap items-center justify-between gap-2 text-sm"
                            >
                              {entry.name && entry.slug ? (
                                <a
                                  href={`/${entry.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-foreground underline-offset-2 hover:underline"
                                >
                                  {entry.name}
                                </a>
                              ) : (
                                <span className="text-foreground">
                                  {entry.name ?? "A guest artist"}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {entry.startsOn === entry.endsOn
                                  ? formatDateKey(entry.startsOn)
                                  : `${formatDateKey(entry.startsOn)} – ${formatDateKey(entry.endsOn)}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              </Section>
            ) : null}

            {detail.houseRules.length > 0 ? (
              <Section title="House rules">
                <ul className="space-y-2 pt-0.5">
                  {detail.houseRules.map((rule) => (
                    <li key={rule.key} className="text-sm">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {HOUSE_RULE_LABELS[rule.key as HouseRuleKey] ??
                          rule.key}
                      </p>
                      <p className="whitespace-pre-wrap text-foreground">
                        {rule.content}
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {detail.requestable && !detail.ownStudio ? (
              <Link
                href={`/map/${pin.id}/request`}
                className="block rounded-md bg-foreground px-3 py-2 text-center text-xs text-background transition-opacity hover:opacity-90"
              >
                Request a guest spot
              </Link>
            ) : null}
          </>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Link
          href={`/map/${pin.id}`}
          className="block rounded-md border border-border px-3 py-2 text-center text-xs text-foreground transition-colors hover:bg-muted/30"
        >
          Open full page
        </Link>
      </div>
    </div>
  );
}
